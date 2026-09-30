/**
 * VARNOX X ULTRA — web.js  v19  (SINGLE-SOCKET PERSISTENT PAIRING)
 *
 * v18 fixes (root cause of the reconnection failure) :
 *
 *  PROBLEM v17/v18 :
 *    - The pairing socket was separate from the bot socket.
 *    - Copying and closing during the handshake could lose
 *      signal keys and cause WhatsApp to reject the code.
 *
 *  FIX v19 :
 *    - The pairing socket uses userSessionDir directly.
 *    - It becomes the bot socket after connection:'open'.
 *    - No tmpDir, no key copying, no close/reconnect
 *      during the WhatsApp handshake.
 */
'use strict';

const settings = require('./settings');

const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
const https    = require('https');
const http     = require('http');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  Browsers,
} = require('@whiskeysockets/baileys');

const pino      = require('pino');
const NodeCache = require('node-cache');

const {
  attachBotHandlers,
  createBotInstance,
  stopBotInstance,
  getBotInstance,
  getAllInstances,
  markConnected,
  getLatestVersion,
  serializeSaveCreds,
  shutdownBotInstances,
  getRuntimeStats,
} = require('./lib/botInstance');

const app  = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

/* ─── Directories ─────────────────────────────────────────── */
const SESSIONS_DIR   = process.env.SESSION_DIR
  ? path.resolve(process.env.SESSION_DIR)
  : path.join(__dirname, 'sessions');
const LEGACY_SESSION = path.join(__dirname, 'session');
const DATA_DIR       = path.join(__dirname, 'data');
const OWNER_JSON     = path.join(DATA_DIR, 'owner.json');
const CONFIGURED_OWNER_NUMBER = String(process.env.OWNER_NUMBER || settings.ownerNumber || '').replace(/\D/g, '');
const DEFAULT_BOT_NUMBER = String(process.env.BOT_NUMBER || '').replace(/\D/g, '');

[SESSIONS_DIR, LEGACY_SESSION, DATA_DIR].forEach(d => {
  try { fs.mkdirSync(d, { recursive: true }); } catch {}
});

/* ─── owner.json ──────────────────────────────────────────── */
function initOwnerJson() {
  let cur = {};
  try { if (fs.existsSync(OWNER_JSON)) cur = JSON.parse(fs.readFileSync(OWNER_JSON, 'utf8')); } catch {}
  const ownerNumber = CONFIGURED_OWNER_NUMBER || cur.ownerNumber || '';
  if (!ownerNumber && !cur.ownerNumber) return;
  try {
    fs.writeFileSync(OWNER_JSON, JSON.stringify({
      ownerNumber,
      ownerName   : cur.ownerName || 'Owner',
      botName     : cur.botName   || 'VARNOX X ULTRA',
      prefix      : cur.prefix    || process.env.PREFIX || '.',
      version     : '2.0.0',
      mess        : cur.mess      || 'Owner',
    }, null, 2));
  } catch {}
}
initOwnerJson();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

/* ─── Keep-alive Render free tier ────────────────────────── */
const SELF_URL = process.env.RENDER_EXTERNAL_URL
  || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : null);

if (SELF_URL) {
  setInterval(() => {
    const mod = SELF_URL.startsWith('https') ? https : http;
    mod.get(`${SELF_URL}/ping`, () => {}).on('error', () => {}).end();
  }, 14 * 60 * 1000);
}

/* ─── Pairing sockets in progress ───────────────────────── */
// Map<string, { sock, saveCreds, sessionDir, timer }>
const pairingSockets = new Map();
// Only one active code generation per number. This prevents a double click
// or two tabs from destroying each other's pairing session.
const pairingRequests = new Map();
const pairingRecoveryPromises = new Map();
const pairingRecoveryInProgress = new Set();
const pairingRate = new Map();
const HTTP_METRICS = { total: 0, active: 0, errors: 0 };
const PAIRING_METRICS = { requests: 0, rejected: 0, reused: 0, inFlight: 0 };
const STARTED_AT = Date.now();
const PAIRING_RATE_WINDOW_MS = Math.max(60_000, Number(process.env.PAIRING_RATE_WINDOW_MS || 10 * 60 * 1000));
const PAIRING_RATE_MAX = Math.max(1, Number(process.env.PAIRING_RATE_MAX || 5));
const MAX_PAIRING_RECOVERY_ATTEMPTS = Math.max(1, Number(process.env.MAX_PAIRING_RECOVERY_ATTEMPTS || 10));

app.set('trust proxy', true);
app.use((req, res, next) => {
  HTTP_METRICS.total += 1;
  HTTP_METRICS.active += 1;
  res.once('finish', () => {
    HTTP_METRICS.active = Math.max(0, HTTP_METRICS.active - 1);
    if (res.statusCode >= 500) HTTP_METRICS.errors += 1;
  });
  next();
});

const pairingRateCleanupTimer = setInterval(() => {
  const cutoff = Date.now() - PAIRING_RATE_WINDOW_MS;
  for (const [key, value] of pairingRate) {
    if (value.startedAt < cutoff) pairingRate.delete(key);
  }
}, PAIRING_RATE_WINDOW_MS);
pairingRateCleanupTimer.unref?.();

/* ─── Sessions marked ready ───────────────────────────── */
// Map<string, { ts }>
const pairedNumbers = new Map();
// Map<string, { code, message, ts }>
const pairingFailures = new Map();

function disconnectInfo(error) {
  const code = error?.output?.statusCode
    ?? error?.data?.statusCode
    ?? error?.statusCode
    ?? error?.output?.payload?.statusCode
    ?? null;
  const message = error?.message || error?.output?.payload?.message || String(error || 'unknown');
  return { code, message };
}

function isPairingRestart(code) {
  return code === 515
    || code === DisconnectReason.restartRequired
    || code === DisconnectReason.connectionLost
    || code === DisconnectReason.timedOut
    || code === DisconnectReason.connectionClosed
    || code === DisconnectReason.connectionReplaced;
}

function isTransientPairingDisconnect(code) {
  return isPairingRestart(code) || [408, 409, 411, 428, 500, 502, 503, 504, 520, 521, 522].includes(code);
}

function closeSocket(sock, reason = 'replaced') {
  if (!sock) return;
  try { sock.ev?.removeAllListeners?.(); } catch (error) {
    console.warn(`[VARNOX] Pairing listener cleanup failed (${reason}):`, error.message);
  }
  try { sock.ws?.close(); } catch (error) {
    console.warn(`[VARNOX] Pairing socket close failed (${reason}):`, error.message);
  }
}

function allowPairingRequest(req, number) {
  const ip = String(req.ip || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const key = `${ip}:${number}`;
  const now = Date.now();
  const current = pairingRate.get(key);
  if (!current || now - current.startedAt >= PAIRING_RATE_WINDOW_MS) {
    pairingRate.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= PAIRING_RATE_MAX) return false;
  current.count += 1;
  return true;
}

function markPairingPending(sessionDir) {
  try {
    fs.writeFileSync(path.join(sessionDir, '.pairing_pending'), JSON.stringify({
      at: new Date().toISOString(),
      pid: process.pid,
    }));
  } catch (error) {
    console.error('[VARNOX] Unable to mark pairing session:', error.message);
  }
}

function clearPairingPending(sessionDir) {
  try { fs.rmSync(path.join(sessionDir, '.pairing_pending'), { force: true }); } catch {}
}

function pairingSocketOptions(version, logger, state) {
  return {
    version,
    logger,
    printQRInTerminal: false,
    // This is the profile used by the last known-good pairing flow.
    // Keep it aligned with the Baileys 7 pairing implementation.
    browser: Browsers.ubuntu('Chrome'),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    msgRetryCounterCache: new NodeCache({ stdTTL: 120 }),
    connectTimeoutMs: 30000,
    keepAliveIntervalMs: 15000,
    markOnlineOnConnect: false,
  };
}

function schedulePairingRecovery(number, sessionDir, delayMs = 750) {
  const pending = pairingSockets.get(number);
  if (!pending || pending.recoveryTimer || pending.recovering || pairedNumbers.has(number)) return;
  pending.recoveryTimer = setTimeout(() => {
    pending.recoveryTimer = null;
    recoverPairingSocket(number, sessionDir).catch(error => {
      console.error(`[VARNOX] Pairing recovery task failed for ${number}:`, error.message);
    });
  }, delayMs);
  pending.recoveryTimer.unref?.();
}

async function recoverPairingSocket(number, sessionDir) {
  const pending = pairingSockets.get(number);
  if (!pending || pending.recovering || pairedNumbers.has(number) || pairingRecoveryInProgress.has(number)) return;

  pairingRecoveryInProgress.add(number);
  pending.recovering = true;
  pending.recoveryAttempts = (pending.recoveryAttempts || 0) + 1;
  if (pending.recoveryAttempts > MAX_PAIRING_RECOVERY_ATTEMPTS) {
    const message = 'WhatsApp closed the pairing connection. The session is kept ; generate a new code if necessary.';
    pairingFailures.set(number, { code: 515, message, ts: Date.now() });
    clearTimeout(pending.timer);
    clearTimeout(pending.recoveryTimer);
    closeSocket(pending.sock, 'pairing recovery limit');
    pairingSockets.delete(number);
    pairingRecoveryInProgress.delete(number);
    return;
  }

  try {
    // Important: reuse the same auth directory. Recreating an empty session
    // produces a new identity and invalidates the code that is on the phone.
    const logger = pino({ level: 'silent' });
    closeSocket(pending.sock, 'pairing recovery');
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const serializedSaveCreds = serializeSaveCreds(saveCreds);
    const version = await getLatestVersion();
    const sock = makeWASocket(pairingSocketOptions(version, logger, state));
    sock.ev.on('creds.update', serializedSaveCreds);
    sock._credsHandlerAttached = true;

    const next = {
      ...pending,
      sock,
      saveCreds: serializedSaveCreds,
      recovering: false,
      recoveryTimer: null,
    };
    pairingSockets.set(number, next);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
      if (pairingSockets.get(number) !== next) return;

      if (connection === 'open') {
        try {
          await next.activate(sock, serializedSaveCreds);
        } catch (e) {
          console.error(`[VARNOX] Pairing recovery activation failed for ${number}:`, e.message);
          pairingFailures.set(number, { code: 500, message: e.message, ts: Date.now() });
          clearTimeout(next.timer);
          pairingSockets.delete(number);
          
        }
        return;
      }

      if (connection === 'close' && !pairedNumbers.has(number)) {
        const info = disconnectInfo(lastDisconnect?.error);
        if (info.code === 401 || info.code === DisconnectReason.loggedOut) {
          const message = 'WhatsApp rejected the code. Remove the old linked devices and generate a new code.';
          pairingFailures.set(number, { code: 401, message: `${message} The session is kept.`, detail: info.message, ts: Date.now() });
          clearTimeout(next.timer);
          pairingSockets.delete(number);
        } else if (isPairingRestart(info.code)) {
          schedulePairingRecovery(number, sessionDir, Math.min(60000, 750 * (2 ** Math.min(next.recoveryAttempts - 1, 6))));
        }
      }
    });
  } catch (e) {
    pending.recovering = false;
    console.error(`[VARNOX] Pairing recovery failed for ${number}:`, e.message);
    schedulePairingRecovery(number, sessionDir, 1500);
  } finally {
    pairingRecoveryInProgress.delete(number);
  }
}

/* ═══════════════════════════════════════════════════════════
 *  Starting existing sessions (at boot)
 * ═══════════════════════════════════════════════════════════ */
async function startExistingSessions() {
  // Restore every persisted session without deleting or replacing credentials.
  const restoreJobs = [];
  // Sessions multi-user ./sessions/user_<number>/
  try {
    const dirs = fs.readdirSync(SESSIONS_DIR);
    for (const dir of dirs) {
      const m = dir.match(/^user_(\d+)$/);
      if (!m) continue;
      const num = m[1];
      const sd  = path.join(SESSIONS_DIR, dir);
      if (fs.existsSync(path.join(sd, '.logged_out'))) {
        console.warn(`[VARNOX] Skipping logged-out session: ${num}`);
        continue;
      }
      if (!fs.existsSync(path.join(sd, 'creds.json'))) continue;
      if (fs.existsSync(path.join(sd, '.pairing_pending'))) {
        let registered = false;
        try {
          registered = !!JSON.parse(fs.readFileSync(path.join(sd, 'creds.json'), 'utf8')).registered;
        } catch {}
        if (!registered) {
          console.warn(`[VARNOX] Skipping unfinished pairing session: ${num}`);
          continue;
        }
        // A crash can happen after WhatsApp authenticates but before the
        // marker is cleared. Registered credentials are safe to restore.
        clearPairingPending(sd);
      }
      console.log(`[VARNOX] Restoring session: ${num}`);
      restoreJobs.push(() => createBotInstance(sd, num).catch(e => console.error(`[VARNOX] Restore ${num} failed:`, e.message)));
    }
  } catch (e) { console.error('[VARNOX] startExistingSessions:', e.message); }

  // Legacy single-session backward compat ./session/
  if (fs.existsSync(path.join(LEGACY_SESSION, 'creds.json'))) {
    let ownerNum = 'legacy';
    try { ownerNum = JSON.parse(fs.readFileSync(OWNER_JSON, 'utf8')).ownerNumber || 'legacy'; } catch {}
    if (!getBotInstance(ownerNum)) {
      console.log(`[VARNOX] Legacy session → ${ownerNum}`);
      restoreJobs.push(() => createBotInstance(LEGACY_SESSION, ownerNum).catch(e => console.error('[VARNOX] Legacy restore:', e.message)));
    }
  }
  const restoreConcurrency = Math.max(1, Number(process.env.RESTORE_CONCURRENCY || 2));
  for (let index = 0; index < restoreJobs.length; index += restoreConcurrency) {
    await Promise.allSettled(restoreJobs.slice(index, index + restoreConcurrency).map(start => start()));
  }
  console.log(`[VARNOX] Persistent session restore scheduled: ${restoreJobs.length}`);
}

setTimeout(() => startExistingSessions().catch(e => console.error('[VARNOX] Session restore:', e.message)), 1500);

/* ═══════════════════════════════════════════════════════════
 *  ROUTES
 * ═══════════════════════════════════════════════════════════ */
app.get('/ping', (_q, r) => r.json({ pong: true, ts: Date.now() }));

app.get('/health', (_q, r) => {
  const insts = getAllInstances();
  r.json({
    status: 'ok',
    ready: true,
    bot: 'VARNOX X ULTRA',
    v: '19.4.0',
    build: 'pairing-baileys7-ubuntu',
    waFallback: '2.3000.1043857760',
    uptime: Math.floor(process.uptime()),
    instances: insts,
    total: insts.length,
    runtime: getRuntimeStats(),
    http: HTTP_METRICS,
    pairing: {
      active: pairingSockets.size,
      inFlight: pairingRequests.size,
      rateKeys: pairingRate.size,
      metrics: PAIRING_METRICS,
    },
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
  });
});

app.get('/botStatus', (req, res) => {
  const num = req.query.number ? String(req.query.number).replace(/\D/g, '') : null;
  if (num) {
    const i = getBotInstance(num);
    return res.json({ number: num, running: !!i, connected: !!i?.connected });
  }
  res.json({ instances: getAllInstances() });
});

app.get('/status', (req, res) => {
  const num = req.query.number ? String(req.query.number).replace(/\D/g, '') : null;
  if (!num) return res.json({ instances: getAllInstances() });
  const i = getBotInstance(num);
  res.json({ number: num, connected: !!i?.connected, running: !!i, pairing: pairingSockets.has(num) });
});

app.get('/session', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  let { number } = req.query;
  if (!number) return res.json({ ready: false });
  number = number.replace(/\D/g, '');
  const i = getBotInstance(number);
  // IMPORTANT: creds.json is created from the start of pairing. Its presence
  // does not mean WhatsApp accepted the code.
  if (i?.connected) {
    // pairedNumbers is in-memory and empty after a process restart.
    return res.json({ ready: true, connected: true });
  }
  const failure = pairingFailures.get(number);
  res.json({
    ready    : false,
    connected: false,
    pairing  : pairingSockets.has(number),
    error    : failure?.message || null,
    code     : failure?.code || null,
  });
});

app.get('/reset', (req, res) => {
  const num = req.query.number ? String(req.query.number).replace(/\D/g, '') : null;
  try {
    if (num) {
      pairingFailures.delete(num);
      stopBotInstance(num);
      // Close the pairing socket if one is in progress
      if (pairingSockets.has(num)) {
        const p = pairingSockets.get(num);
        clearTimeout(p.timer);
        clearTimeout(p.recoveryTimer);
        closeSocket(p.sock, 'reset');
        try { fs.rmSync(p.sessionDir, { recursive: true, force: true }); } catch {}
        pairingSockets.delete(num);
      }
      pairedNumbers.delete(num);
      const ud = path.join(SESSIONS_DIR, `user_${num}`);
      try { fs.rmSync(ud, { recursive: true, force: true }); } catch {}
      fs.mkdirSync(ud, { recursive: true });
      return res.json({ ok: true, message: `Session cleared for ${num}. Reconnect to re-pair.` });
    }
    for (const i of getAllInstances()) stopBotInstance(i.number);
    pairingSockets.forEach(p => {
      clearTimeout(p.timer);
      clearTimeout(p.recoveryTimer);
      closeSocket(p.sock, 'reset-all');
    });
    pairingSockets.clear();
    pairedNumbers.clear();
    res.json({ ok: true, message: 'All sessions cleared.' });
  } catch (e) { res.json({ ok: false, error: e.message }); }
});

app.get('/debug', (_q, r) => r.json({
  SESSIONS_DIR,
  instances    : getAllInstances(),
  pairing      : [...pairingSockets.keys()],
  paired       : [...pairedNumbers.keys()],
  failures     : [...pairingFailures.entries()],
  memMB        : Math.round(process.memoryUsage().rss / 1024 / 1024),
  runtime      : getRuntimeStats(),
  http         : HTTP_METRICS,
}));

/* ════════════════════════════════════════════════════════════
 *  /code  — Pairing code generation
 *
 *  FLOW (single socket, persistent session) :
 *
 *  1. Create a Baileys socket in ./sessions/user_<num>/
 *  2. After connection:'connecting' → requestPairingCode (3s delay)
 *  3. Return the code to the frontend
 *  4. When connection:'open' (code entered in WhatsApp) :
 *       a. flush saveCreds()
 *       b. attachBotHandlers() on this same socket
 *       c. keep the connection open — no risky handoff
 * ════════════════════════════════════════════════════════════ */
async function handleCode(req, res) {
  res.setHeader('Content-Type', 'application/json');
  req.setTimeout?.(65000);
  PAIRING_METRICS.requests += 1;

  let number = (req.query.number || req.body?.number || DEFAULT_BOT_NUMBER).toString().replace(/\D/g, '');
  if (!number) return res.json({ error: true, message: 'Number required' });
  if (number.length < 7 || number.length > 15)
    return res.json({ error: true, message: 'Invalid number (7–15 digits, without +)' });
  if (!allowPairingRequest(req, number)) {
    PAIRING_METRICS.rejected += 1;
    return res.status(429).json({
      error: true,
      message: 'Too many pairing requests for this number. Try again in a few minutes.',
      retryAfterSeconds: Math.ceil(PAIRING_RATE_WINDOW_MS / 1000),
    });
  }

  // Already connected?
  const existing = getBotInstance(number);
  if (existing?.connected)
    return res.json({ error: false, already: true, message: 'Already connected.' });
  if (existing && !existing.connected) {
    return res.json({
      error: true,
      preserving: true,
      message: 'This session is temporarily reconnecting. It is preserved ; wait for it to resume or use /reset only for a new pairing.'
    });
  }

  // If the code is already displayed, return it instead of recreating a session.
  // Recreating a socket here would invalidate the code visible in WhatsApp.
  const activePairing = pairingSockets.get(number);
  if (activePairing?.code && (!activePairing.expiresAt || activePairing.expiresAt > Date.now())) {
    PAIRING_METRICS.reused += 1;
    return res.json({ error: false, code: activePairing.code, reused: true });
  }

  // Concurrent requests for the same number share the same result.
  // Different users keep, in turn, using their own
  // sessions in parallel.
  const runningRequest = pairingRequests.get(number);
  if (runningRequest) {
    try {
      return res.json(await runningRequest);
    } catch (error) {
      return res.json({ error: true, message: error.message || 'Code generation error' });
    }
  }

  let resolveRequest;
  let rejectRequest;
  const requestResult = new Promise((resolve, reject) => {
    resolveRequest = resolve;
    rejectRequest = reject;
  });
  pairingRequests.set(number, requestResult);
  PAIRING_METRICS.inFlight += 1;

  const userSessionDir = path.join(SESSIONS_DIR, `user_${number}`);
  const sessionDir     = userSessionDir;

  // Close the previous pairing for this number if it exists
  if (pairingSockets.has(number)) {
    const old = pairingSockets.get(number);
    // Remove the old entry before closing the socket: its
    // "close" event must never affect the new attempt for the same number.
    pairingSockets.delete(number);
    clearTimeout(old.timer);
    closeSocket(old.sock, 'new pairing request');
    try { fs.rmSync(old.sessionDir, { recursive: true, force: true }); } catch {}
    await new Promise(r => setTimeout(r, 300));
  }

  // A previous unconnected attempt may have left incomplete
  // keys. We start from a clean session for each new code.
           // Preserve the auth directory for diagnostics and to avoid
           // destroying valid credentials after a temporary close.
  fs.mkdirSync(sessionDir, { recursive: true });
  markPairingPending(sessionDir);

  console.log(`[VARNOX] /code for ${number}`);
  pairingFailures.delete(number);

  let sock = null;
  try {
    // ── Create the socket directly in the permanent session ────────────
    const logger = pino({ level: 'silent' });
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const serializedSaveCreds = serializeSaveCreds(saveCreds);
    // Never generate a code with the fallback version when the network is
    // available: WhatsApp may display it then reject its validation.
    const version = await getLatestVersion();

    sock = makeWASocket(pairingSocketOptions(version, logger, state));

    // ★ CRITICAL: register creds.update right now (to sessionDir).
    // WhatsApp sends key updates continuously during and after
    // pairing. Without this handler, the session keys (noise keys, signal
    // pre-keys, etc.) are not written to disk as they go.
    // The manual saveCreds() in promotePairToBot is not enough because some
    // updates arrive AFTER connection:'open' — race condition.
    sock.ev.on('creds.update', serializedSaveCreds);

    // ── Pairing code promise ──────────────────────────────────────
    let codeResolve, codeReject;
    let codeDone    = false;
    let pairStarted = false;
    let attempts    = 0;

    const codePromise = new Promise((res, rej) => { codeResolve = res; codeReject = rej; });

    const hardTimer = setTimeout(() => {
      if (!codeDone) {
        codeDone = true;
        codeReject(new Error('Timeout 60s — WhatsApp did not prepare the connection. Try again in a few seconds.'));
      }
    }, 60000);

    async function tryGetCode() {
      if (codeDone) return;
      attempts++;
      try {
        if (state.creds.registered) {
          codeDone = true; clearTimeout(hardTimer);
          codeReject(new Error('Number already registered. In WhatsApp → Linked devices → remove the bot, then try again.'));
          return;
        }
        const raw = await sock.requestPairingCode(number);
        if (!codeDone) {
          if (raw) { codeDone = true; clearTimeout(hardTimer); codeResolve(raw); }
          else if (attempts < 5) setTimeout(tryGetCode, Math.min(400 * attempts, 2000));
          else { codeDone = true; clearTimeout(hardTimer); codeReject(new Error('Null code. Try again.')); }
        }
      } catch (e) {
        if (codeDone) return;
        if (attempts < 5) setTimeout(tryGetCode, Math.min(500 * attempts, 2500));
        else { codeDone = true; clearTimeout(hardTimer); codeReject(new Error(e.message)); }
      }
    }

    // ── Session handling after successful pairing ───────────────────────
    // The socket stays open and directly becomes the bot socket.
    let pairActivated = false;

    async function promotePairToBot(activeSock = sock, activeSaveCreds = serializedSaveCreds) {
      // Avoid a double trigger if connection:'open' fires twice
      if (pairActivated) return;
      pairActivated = true;

      // Let the last signal keys be written before activation.
      await new Promise(r => setTimeout(r, 1200));
      try { await activeSaveCreds(); } catch (e) {
        console.error(`[VARNOX] saveCreds error:`, e.message);
      }

      if (!fs.existsSync(path.join(sessionDir, 'creds.json'))) {
        pairActivated = false;
        throw new Error('creds.json missing after authentication');
      }

      // The paired WhatsApp account is the bot identity. Never write it
      // into owner.json: OWNER_NUMBER remains the permanent administrator.
      if (getAllInstances().length === 0) initOwnerJson();
      pairedNumbers.set(number, { ts: Date.now() });
      clearPairingPending(sessionDir);

      // The current socket becomes the bot socket: no second handshake.
      const p = pairingSockets.get(number);
      if (p) { clearTimeout(p.timer); pairingSockets.delete(number); }

      attachBotHandlers(activeSock, sessionDir, number, activeSaveCreds);
      markConnected(number);
      console.log(`[VARNOX] ✅ Bot activated on persistent socket for ${number}`);
    }

    // Registering the socket before the code is returned lets a
    // second request and the 515 events find the exact session.
    const pendingPairing = {
      sock,
      saveCreds: serializedSaveCreds,
      sessionDir,
      timer: null,
      code: null,
      expiresAt: null,
      activate: promotePairToBot,
      recoveryAttempts: 0,
      recovering: false,
      recoveryTimer: null,
    };
    pairingSockets.set(number, pendingPairing);

    // ── Connection listener ─────────────────────────────────────────────
    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
      if (pairingSockets.get(number) !== pendingPairing) return;

      if (connection === 'connecting' && !pairStarted) {
        pairStarted = true;
        // The socket is already in the handshake phase. A short wait avoids
        // the race without imposing the several-second delay of the old
        // implementation.
        setTimeout(tryGetCode, 650);
      }

      if (connection === 'open') {
        console.log(`[VARNOX] ✅ WA authenticated for ${number}`);
        try {
          await promotePairToBot(sock, serializedSaveCreds);
        } catch (error) {
          console.error(`[VARNOX] Pairing activation failed for ${number}:`, error.message);
          pairingFailures.set(number, { code: 500, message: error.message, ts: Date.now() });
          clearTimeout(pendingPairing.timer);
          pairingSockets.delete(number);
        }
      }

      if (connection === 'close') {
        // After activation, the botInstance handler manages reconnection.
        if (pairActivated) return;

        const info      = disconnectInfo(lastDisconnect?.error);
        const sc        = info.code;
        const loggedOut = sc === DisconnectReason.loggedOut || sc === 401;
        console.error(`[VARNOX] Pairing socket closed for ${number}; code=${sc ?? 'unknown'}; reason=${info.message}`);

        if (!codeDone) {
          // The code has not been emitted yet — report the error
          if (loggedOut) {
            const message = 'WhatsApp rejected the connection before code validation.';
            pairingFailures.set(number, { code: sc || 401, message, detail: info.message, ts: Date.now() });
            codeDone = true;
            clearTimeout(hardTimer);
            codeReject(new Error(message));
          }
          // Otherwise Baileys reconnects automatically → we let it happen
          return;
        }

        // WhatsApp commonly closes the first socket with 515
        // (restartRequired) while finishing phone-number linking. This is
        // not a rejection: keep the same auth directory and reconnect it.
        if (codeDone && isTransientPairingDisconnect(sc)) {
          console.warn(`[VARNOX] Pairing socket restart required for ${number}; preserving session`);
          schedulePairingRecovery(number, sessionDir, 750);
          return;
        }

        // A real rejection invalidates the displayed code.
        if (!pairedNumbers.has(number)) {
          const message = sc === 401
            ? 'Code rejected by WhatsApp. Remove the old linked sessions, wait a few seconds, then generate a new code.'
            : `WhatsApp connection closed before validation (code ${sc ?? 'unknown'}).`;
          pairingFailures.set(number, { code: sc || 0, message, detail: info.message, ts: Date.now() });
          const p = pairingSockets.get(number);
          if (p) { clearTimeout(p.timer); pairingSockets.delete(number); }
           // Keep the directory; /reset or a deliberate new /code attempt
           // can clear an incomplete pairing explicitly.
        }
        // Otherwise → Baileys / botInstance manages reconnection
      }
    });

    // Fallback: if 'connecting' is slow or does not fire before we
    // register the listener (possible race condition with some versions)
    setTimeout(() => {
      if (!codeDone && !pairStarted) {
        pairStarted = true;
        tryGetCode();
      }
    }, 2500);

    // ── Wait for the code ──────────────────────────────────────────────────
    const raw       = await codePromise;
    const formatted = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').match(/.{1,4}/g)?.join('-') || raw;

    console.log(`[VARNOX] Code for ${number}: ${formatted}`);

    // Keep the socket alive for up to 15 min
    const timer = setTimeout(() => {
      if (pairingSockets.has(number)) {
        closeSocket(pairingSockets.get(number).sock, 'pairing expiry');
        pairingSockets.delete(number);
         // Keep the directory so a temporary timeout cannot destroy auth data.
      }
    }, 15 * 60 * 1000);

    pendingPairing.timer = timer;
    pendingPairing.code = formatted;
    pendingPairing.expiresAt = Date.now() + 15 * 60 * 1000;

    const result = { error: false, code: formatted };
    resolveRequest(result);
    pairingRequests.delete(number);
    PAIRING_METRICS.inFlight = Math.max(0, PAIRING_METRICS.inFlight - 1);
    return res.json(result);

  } catch (err) {
    console.error(`[VARNOX] /code error ${number}:`, err.message);
    pairingRequests.delete(number);
    PAIRING_METRICS.inFlight = Math.max(0, PAIRING_METRICS.inFlight - 1);
    rejectRequest(err);
    const pending = pairingSockets.get(number);
    if (pending) {
      clearTimeout(pending.timer);
      pairingSockets.delete(number);
    }
    closeSocket(sock, 'pairing request failure');
    const result = { error: true, message: err.message || 'Code generation error' };
    return res.json(result);
  }
}

app.get('/code',  handleCode);
app.post('/code', handleCode);

app.use((error, _req, res, _next) => {
  const status = Number(error?.statusCode || error?.status || 500);
  console.error('[VARNOX] HTTP request error:', error?.message || error);
  if (res.headersSent) return;
  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: true,
    message: status >= 500 ? 'Internal server error.' : (error?.message || 'Invalid request.'),
  });
});

/* ─── SPA fallback ─────────────────────────────────────────── */
app.get('*', (_q, r) => {
  const p = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(p)) return r.sendFile(p);
  r.json({ status: 'VARNOX X ULTRA — Multi-User', v: '19.4.0' });
});

/* ─── Startup and clean shutdown ───────────────────────────── */
let server;
let shuttingDown = false;

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.warn(`[VARNOX] ${signal}: graceful shutdown started`);
  clearInterval(pairingRateCleanupTimer);
  for (const [number, pending] of pairingSockets) {
    clearTimeout(pending.timer);
    clearTimeout(pending.recoveryTimer);
    closeSocket(pending.sock, `shutdown:${signal}`);
    pairingSockets.delete(number);
  }
  await shutdownBotInstances();
  if (siteBridge) { try { await siteBridge.stop(); } catch { /* nothing useful to do while exiting */ } }
  if (server) {
    await new Promise(resolve => {
      const timeout = setTimeout(resolve, 5000);
      timeout.unref?.();
      server.close(() => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }
  console.warn(`[VARNOX] ${signal}: sessions preserved; exiting`);
  process.exit(exitCode);
}

process.on('SIGTERM', () => { shutdown('SIGTERM').catch(error => { console.error('[VARNOX] SIGTERM shutdown failed:', error); process.exit(1); }); });
process.on('SIGINT', () => { shutdown('SIGINT').catch(error => { console.error('[VARNOX] SIGINT shutdown failed:', error); process.exit(1); }); });
process.on('uncaughtException', error => {
  console.error('[VARNOX] uncaughtException:', error?.stack || error);
  shutdown('uncaughtException', 1).catch(shutdownError => {
    console.error('[VARNOX] fatal shutdown failure:', shutdownError);
    process.exit(1);
  });
});
process.on('unhandledRejection', reason => {
  console.error('[VARNOX] unhandledRejection:', reason?.stack || reason);
});

server = app.listen(PORT, HOST, () => {
  console.log(`\n╔════════════════════════════════════════════════╗`);
  console.log(`║  VARNOX X ULTRA v19.4 — Pairing stable             ║`);
  console.log(`║  Port : ${PORT} / Host : ${HOST}                  ║`);
  console.log(`║  saveCreds → persistent session                  ║`);
  console.log(`╚════════════════════════════════════════════════╝\n`);
});
server.on('error', error => {
  console.error('[VARNOX] HTTP server error:', error);
});

// ── Link this bot to the VARNOX website ──────────────────────────────────────
// Publishes the heartbeat the dashboard reads, drains the website's pairing
// queue through /code, and mirrors live sessions so they appear on the site.
// Inert unless DATABASE_URL is set, so standalone use is unchanged.
// `var`, not `let`: shutdown() may run from an uncaughtException during module
// load, and a `let` declared this far down would still be in its temporal dead
// zone at that point.
var siteBridge = null;
require('./lib/siteBridge').startSiteBridge()
  .then(bridge => { siteBridge = bridge; })
  .catch(error => console.error('[site-bridge] failed to start:', error.message));
server.requestTimeout = 70_000;
server.headersTimeout = 75_000;
server.keepAliveTimeout = 65_000;

module.exports = app;
