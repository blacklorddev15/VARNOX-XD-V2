'use strict';

/**
 * Site bridge — makes this bot visible to, and usable from, the VARNOX website
 * (the project that serves the pairing page and the admin dashboard).
 *
 * The website is driven entirely by a Postgres schema it creates for itself:
 *
 *   varnox_pairing_requests   the queue. The site inserts a row with status
 *                             'pending'; this bridge claims it, asks WhatsApp for
 *                             a pairing code, and writes the result back.
 *   varnox_server_heartbeats  one row per bot host (ids 1..3), refreshed on a
 *                             timer. The dashboard shows a host online while its
 *                             last_seen is under two minutes old.
 *   varnox_sessions           one row per WhatsApp session. The dashboard counts
 *                             a session online when status = 'connected' and
 *                             updated_at is inside the last fifteen minutes.
 *
 * The status strings are not ours to choose: the site's front-end branches on
 * 'pending' | 'code_generated' | 'connected' | 'failed' | 'expired', so those
 * exact values are used below.
 *
 * Why this calls the bot's own /code route instead of opening a second Baileys
 * socket: web.js already owns pairing — rate limiting, the 515 restart dance,
 * per-number session directories, socket recovery. A second implementation would
 * drift from it, and two live sockets for one number invalidate each other's
 * codes. So the bridge is a transport, nothing more.
 *
 * Inert by default. Without a connection string it logs one line and never
 * touches the network, so the bot behaves exactly as it did before.
 */

const { Pool } = require('pg');
const fetch = require('node-fetch');

const HEARTBEAT_MS   = Number(process.env.SITE_HEARTBEAT_MS || 45_000);
const POLL_MS        = Number(process.env.SITE_POLL_MS || 5_000);
const SESSIONS_MS    = Number(process.env.SITE_SESSIONS_MS || 30_000);
const ACTIVE_DB_MS   = Number(process.env.SITE_ACTIVE_DB_MS || 60_000);
const CODE_TIMEOUT   = Number(process.env.SITE_CODE_TIMEOUT_MS || 75_000);
const MAX_PER_TICK   = Number(process.env.SITE_MAX_PER_TICK || 2);

const CONTROL_URL = String(
  process.env.SITE_DATABASE_URL || process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || ''
).trim();

const SERVER_ID   = Math.min(3, Math.max(1, Number(process.env.SITE_SERVER_ID || 1)));
const SERVER_NAME = String(process.env.SITE_SERVER_NAME || '').trim() || `Server ${SERVER_ID}`;

// Where the bot's own pairing route lives. Defaults to this process.
const BOT_URL = String(
  // Must resolve to the port web.js actually bound, or every pairing call lands on nothing.
  // Same order as web.js: PORT first (Render), then SERVER_PORT (Pterodactyl).
  process.env.SITE_BOT_URL
    || `http://127.0.0.1:${process.env.PORT || process.env.SERVER_PORT || 3000}`
).replace(/\/$/, '');

const PREFIX = 'varnox_';

function makePool(url) {
  return new Pool({
    connectionString: String(url).split('?')[0],
    // Neon and most hosted Postgres terminate TLS with a certificate this
    // process has no CA for; the connection is still encrypted.
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
}

class SiteBridge {
  constructor() {
    this.controlPool = makePool(CONTROL_URL);
    this.dataPool = this.controlPool;
    this.controlHost = '';
    this.activeUrl = CONTROL_URL;
    this.timers = [];
    this.stopped = false;
    this.busy = false;
  }

  log(msg) { console.log(`[site-bridge] ${msg}`); }
  warn(msg) { console.warn(`[site-bridge] ${msg}`); }

  /** Host only — never the credential. */
  static hostOf(url) {
    try { return new URL(String(url).split('?')[0]).host; } catch (_) { return ''; }
  }

  /**
   * The site can be pointed at a different database from its admin panel: the
   * chosen URL is stored in varnox_settings and every cold start reads it,
   * falling back to the environment. The bridge mirrors that, so switching the
   * database on the website moves the bot with it instead of leaving the bot
   * poll a database nobody is writing to.
   */
  async resolveActive() {
    let next = CONTROL_URL;
    try {
      const { rows } = await this.controlPool.query(
        `SELECT value FROM ${PREFIX}settings WHERE key = 'active_database_url'`
      );
      const stored = String((rows[0] && rows[0].value) || '').trim();
      if (/^postgres(ql)?:\/\//i.test(stored)) next = stored;
    } catch (e) {
      // A missing settings table just means the site has not created its schema
      // yet; the environment URL is still the right answer.
      this.warn(`could not read active_database_url (${e.message}); using the environment URL`);
    }

    if (next !== this.activeUrl) {
      const old = this.activeUrl;
      this.activeUrl = next;
      if (this.dataPool !== this.controlPool) await this.dataPool.end().catch(() => {});
      this.dataPool = next === CONTROL_URL ? this.controlPool : makePool(next);
      this.log(`active database -> ${SiteBridge.hostOf(next)} (was ${SiteBridge.hostOf(old)})`);
    }
    return this.activeUrl;
  }

  async heartbeat() {
    await this.dataPool.query(
      `INSERT INTO ${PREFIX}server_heartbeats (server_id, name, last_seen)
       VALUES ($1, $2, now())
       ON CONFLICT (server_id) DO UPDATE SET last_seen = now(), name = EXCLUDED.name`,
      [SERVER_ID, SERVER_NAME]
    );
  }

  /**
   * Ask this bot's own pairing route for a code.
   * web.js answers { error: false, code: 'ABCD1234' } or
   * { error: true, message: '...' }, and reuses an already-visible code rather
   * than generating a second one.
   */
  async requestCode(phone) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CODE_TIMEOUT);
    try {
      const res = await fetch(`${BOT_URL}/code?number=${encodeURIComponent(phone)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: phone }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        return { code: null, error: data.message || 'Too many pairing attempts for this number.' };
      }
      if (data && data.code) return { code: String(data.code), error: null };
      // /code answers { already: true } when the number is linked but no code can
      // be issued. That is not a failure, but it has no code either, and the site's
      // panel only understands "has a code" or "here is why not" — so it is
      // reported in the second form, with a sentence that says what actually
      // happened instead of a bare error.
      if (data && data.already) {
        return { code: null, error: 'This number is already linked — no new code is needed.' };
      }
      return { code: null, error: (data && data.message) || `Pairing failed (HTTP ${res.status}).` };
    } catch (e) {
      const msg = e.name === 'AbortError'
        ? 'Timed out waiting for WhatsApp to issue a code.'
        : `Could not reach the pairing route: ${e.message}`;
      return { code: null, error: msg };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * One pass over the queue.
   *
   * The claim is a single UPDATE guarded by status = 'pending', so with several
   * bot hosts running (servers 1..3) exactly one of them can win a given row.
   * Selecting and then updating would let two hosts generate two codes for one
   * number, and WhatsApp invalidates the first.
   */
  async pump() {
    // Rows the site's front-end is still polling but that can never complete.
    await this.dataPool.query(
      `UPDATE ${PREFIX}pairing_requests
          SET status = 'expired', updated_at = now()
        WHERE status IN ('pending', 'processing') AND expires_at <= now()`
    );

    for (let i = 0; i < MAX_PER_TICK; i += 1) {
      // CTE + UPDATE ... FROM rather than a locked subquery: this is the form the
      // PostgreSQL docs give for a queue, and it reads unambiguously.
      const claimed = await this.dataPool.query(
        `WITH next AS (
           SELECT id FROM ${PREFIX}pairing_requests
            WHERE status = 'pending' AND expires_at > now()
            ORDER BY id
            LIMIT 1
            FOR UPDATE SKIP LOCKED
         )
         UPDATE ${PREFIX}pairing_requests r
            SET status = 'processing', updated_at = now()
           FROM next
          WHERE r.id = next.id
          RETURNING r.id, r.phone`
      );
      const row = claimed.rows[0];
      if (!row) return;

      this.log(`request #${row.id} for ${row.phone}`);
      const { code, error } = await this.requestCode(row.phone);

      if (code) {
        await this.dataPool.query(
          `UPDATE ${PREFIX}pairing_requests
              SET status = 'code_generated', pairing_code = $2, error = NULL, updated_at = now()
            WHERE id = $1`,
          [row.id, code]
        );
        this.log(`request #${row.id} -> code issued`);
      } else {
        await this.dataPool.query(
          `UPDATE ${PREFIX}pairing_requests
              SET status = 'failed', error = $2, updated_at = now()
            WHERE id = $1`,
          [row.id, String(error || 'Pairing failed.').slice(0, 500)]
        );
        this.warn(`request #${row.id} failed: ${error}`);
      }
    }
  }

  /**
   * Mirror the bot's live sessions into varnox_sessions so the dashboard lists
   * them. The id is the phone number: it is what the site already keys on, and
   * it is stable across restarts, unlike the in-memory instance list.
   */
  async syncSessions() {
    const res = await fetch(`${BOT_URL}/botStatus`, { timeout: 15_000 });
    const data = await res.json().catch(() => ({}));
    const instances = Array.isArray(data.instances) ? data.instances : [];
    if (!instances.length) return;

    for (const inst of instances) {
      const phone = String(inst.number || '').replace(/\D/g, '');
      if (!phone) continue;
      const status = inst.connected ? 'connected' : 'disconnected';
      await this.dataPool.query(
        `INSERT INTO ${PREFIX}sessions (id, phone, status, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (id) DO UPDATE
           SET phone = EXCLUDED.phone, status = EXCLUDED.status, updated_at = now()`,
        [phone, phone, status]
      );
    }
  }

  every(ms, label, fn) {
    const tick = async () => {
      if (this.stopped) return;
      try {
        if (label === 'pump' && this.busy) return;
        if (label === 'pump') this.busy = true;
        await fn();
      } catch (e) {
        this.warn(`${label}: ${e && e.message}`);
      } finally {
        if (label === 'pump') this.busy = false;
      }
    };
    const timer = setInterval(tick, ms);
    timer.unref?.();
    this.timers.push(timer);
    return tick;
  }

  async start() {
    if (this.stopped) return this;

    // Prove the connection before scheduling anything, so a bad URL reports
    // itself once instead of every five seconds forever.
    try {
      await this.controlPool.query('SELECT 1');
    } catch (e) {
      this.warn(`database unreachable (${e.message}) — bridge disabled`);
      this.stopped = true;
      return this;
    }

    this.log(`online as "${SERVER_NAME}" → ${SiteBridge.hostOf(this.activeUrl)}`);
    this.log(`pairing route: ${BOT_URL}`);

    // First pass immediately, then on timers.
    const hb = this.every(HEARTBEAT_MS, 'heartbeat', async () => {
      await this.resolveActive();
      await this.heartbeat();
    });
    const pump = this.every(POLL_MS, 'pump', async () => {
      await this.resolveActive();
      await this.pump();
    });
    const sess = this.every(SESSIONS_MS, 'sessions', async () => {
      await this.resolveActive();
      await this.syncSessions();
    });

    try { await this.resolveActive(); } catch (_) { /* logged inside */ }
    await hb().catch(() => {});
    await sess().catch(() => {});
    pump().catch(() => {});

    return this;
  }

  async stop() {
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    await this.controlPool.end().catch(() => {});
    if (this.dataPool !== this.controlPool) await this.dataPool.end().catch(() => {});
  }
}

/**
 * Starts the bridge unless it is switched off or has nothing to connect to.
 * Returns null when inactive so callers can ignore the result.
 */
async function startSiteBridge() {
  if (String(process.env.SITE_BRIDGE || '').toLowerCase() === 'off') {
    console.log('[site-bridge] disabled by SITE_BRIDGE=off');
    return null;
  }
  if (!CONTROL_URL) {
    console.log('[site-bridge] inactive — set DATABASE_URL to link this bot to the website');
    return null;
  }
  const bridge = new SiteBridge();
  await bridge.start();
  return bridge;
}

module.exports = { startSiteBridge, SiteBridge };
