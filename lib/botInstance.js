/**
 * VARNOX X ULTRA — lib/botInstance.js  v4
 *
 * v4 :
 *  - Guard _botHandlersAttached moved to the TOP of attachBotHandlers.
 *    In v3 it was after all the ev.on(), so only connection.update
 *    was protected against double registration. Now ALL the
 *    handlers are protected if attachBotHandlers is called twice on
 *    the same socket object.
 *
 *  Note: with the two-socket fix of web.js v18, attachBotHandlers is no
 *  longer ever called on the pairing socket. It is only called
 *  from createBotInstance which always creates a new socket. This guard
 *  is therefore a defensive safety.
 *
 * Single use since v18:
 *   createBotInstance(sessionDir, ownerNumber)
 *     → Creates a new Baileys socket and attaches the handlers.
 *     → Used at boot (existing sessions) AND after successful pairing.
 */
'use strict';

const fs        = require('fs');
const path      = require('path');
const pino      = require('pino');
const NodeCache = require('node-cache');

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  jidDecode,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  Browsers,
} = require('@whiskeysockets/baileys');

const PhoneNumber = require('awesome-phonenumber');
const { smsg }    = require('./myfunc');
const createStore = require('./lightweight_store');

function getHandlers() { return require('../main'); }

/* ─── Baileys version — preloaded at startup ────────────────── */
// Current fallback used by the known-good Baileys 7 pairing flow. Keep this
// current even when the remote version manifest is temporarily unavailable;
// an old fallback can generate a code that WhatsApp displays but rejects.
let _version = [2, 3000, 1043857760];
let _versionPromise = fetchLatestBaileysVersion()
  .then(r => {
    if (r?.version) _version = r.version;
    return _version;
  })
  .catch(() => _version);

function getVersion() { return _version; }

// Pairing must wait for the current WA version. The historical fallback
// could generate a code displayed but rejected when validated.
async function getLatestVersion() {
  try {
    return await Promise.race([
      _versionPromise,
      new Promise(resolve => setTimeout(() => resolve(_version), 2500)),
    ]);
  } catch {
    return _version;
  }
}

/* ─── Instance registry ─────────────────────────────────── */
// Map<string, { sock, store, sessionDir, ownerNumber, connected, restartTimer, saveCreds }>
const instances = new Map();
const instanceCreationPromises = new Map();

const runtimeStats = {
  startedAt: Date.now(),
  connectionEvents: 0,
  connected: 0,
  reconnectAttempts: 0,
  pairingActivations: 0,
  messageQueued: 0,
  messageDropped: 0,
  lastDisconnect: null,
};

const MESSAGE_CONCURRENCY = Math.max(1, Number(process.env.MESSAGE_CONCURRENCY || 4));
const MAX_MESSAGE_QUEUE = Math.max(25, Number(process.env.MAX_MESSAGE_QUEUE || 250));

function serializeSaveCreds(saveCreds) {
  let pending = Promise.resolve();
  return function serializedSaveCreds() {
    const current = pending.then(() => saveCreds());
    pending = current.catch(() => {});
    return current;
  };
}

function closeSocket(sock, reason = 'replaced') {
  if (!sock) return;
  try {
    sock.ev?.removeAllListeners?.();
  } catch (error) {
    console.warn(`[VARNOX] Listener cleanup failed (${reason}):`, error.message);
  }
  try {
    sock.ws?.close();
  } catch (error) {
    console.warn(`[VARNOX] Socket close failed (${reason}):`, error.message);
  }
}

function enqueueMessage(inst, key, task) {
  if (inst.stopping) return;
  if (inst.messageQueue.length >= inst.maxMessageQueue) {
    runtimeStats.messageDropped += 1;
    console.warn(`[BOT:${key}] Message queue full (${inst.maxMessageQueue}); event skipped`);
    return;
  }

  inst.messageQueue.push(task);
  runtimeStats.messageQueued += 1;
  pumpMessages(inst, key);
}

function pumpMessages(inst, key) {
  while (!inst.stopping && inst.activeMessages < inst.messageConcurrency && inst.messageQueue.length) {
    const task = inst.messageQueue.shift();
    inst.activeMessages += 1;
    Promise.resolve()
      .then(task)
      .catch(error => console.error(`[BOT:${key}] queued message task:`, error.message))
      .finally(() => {
        inst.activeMessages -= 1;
        pumpMessages(inst, key);
      });
  }
}

const SUPPORT_GROUP_INVITE_CODE =
  process.env.SUPPORT_GROUP_INVITE_CODE || 'HpJN2EktnykClKR5bmz2Dv';
const SUPPORT_CHANNEL_INVITE_CODE =
  process.env.SUPPORT_CHANNEL_INVITE_CODE || '0029Vb7jG2KEawdwHsZiEm1E';
const SUPPORT_CHANNEL_JID = process.env.SUPPORT_CHANNEL_JID || null;
let resolvedSupportChannelJid = SUPPORT_CHANNEL_JID;

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getDisconnectCode(error) {
  return error?.output?.statusCode ?? error?.data?.statusCode ?? error?.statusCode ?? error?.output?.payload?.statusCode ?? null;
}

function isLoggedOut(error) {
  const code = getDisconnectCode(error);
  return code === DisconnectReason.loggedOut || code === 401;
}

async function resolveSupportChannelJid(sock) {
  if (resolvedSupportChannelJid) return resolvedSupportChannelJid;
  if (typeof sock.newsletterMetadata !== 'function') {
    throw new Error('newsletterMetadata unavailable in this version of Baileys');
  }

  const metadata = await sock.newsletterMetadata('invite', SUPPORT_CHANNEL_INVITE_CODE);
  const jid = metadata?.id;
  if (!jid || !jid.endsWith('@newsletter')) {
    throw new Error('Channel JID not found from the invitation link');
  }

  resolvedSupportChannelJid = jid;
  return jid;
}

async function runCommunityAction(label, action) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await action();
      console.log(`[COMMUNITY] ${label}`);
      return true;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await wait(attempt * 1500);
    }
  }

  // A failed community join must never interrupt the bot connection.
  console.warn(`[COMMUNITY] ${label} ignored: ${lastError?.message || 'unknown error'}`);
  return false;
}

/**
 * Add the newly connected account to the official VARNOX spaces.
 *
 * This is intentionally done on connection, not from the menu. The account
 * owner must still be allowed by WhatsApp to accept the group invitation;
 * failures are logged and never prevent the bot from starting.
 */
async function joinOfficialSpaces(sock) {
  if (typeof sock.groupAcceptInvite === 'function') {
    await runCommunityAction(
      'Support group joined or already accessible',
      () => sock.groupAcceptInvite(SUPPORT_GROUP_INVITE_CODE),
    );
  }

  if (typeof sock.newsletterFollow === 'function') {
    await runCommunityAction(
      'VARNOX channel followed or already followed',
      async () => {
        const channelJid = await resolveSupportChannelJid(sock);
        await sock.newsletterFollow(channelJid);
      },
    );
  }

  if (typeof sock.newsletterFollow === 'function') {
    const primaryChannelJid = process.env.PRIMARY_CHANNEL_JID || '120363424782348922@newsletter';
    await runCommunityAction(
      'Main channel followed or already followed',
      () => sock.newsletterFollow(primaryChannelJid),
    );
  }
}

function scheduleCommunityJoin(inst, key, sock) {
  if (inst.communityJoinStarted) return;
  inst.communityJoinStarted = true;
  const timer = setTimeout(() => {
    inst.timers?.delete(timer);
    joinOfficialSpaces(sock).catch((error) => {
      console.warn(`[BOT:${key}] Community setup failed:`, error.message);
    });
  }, 1000);
  timer.unref?.();
  inst.timers?.add(timer);
}

/* ═══════════════════════════════════════════════════════════════
 *  attachBotHandlers
 *  Attaches all Baileys handlers to an already existing socket.
 *  Can be called on the pairing socket after connection:'open'
 *  → no second WhatsApp connection needed.
 * ═══════════════════════════════════════════════════════════════ */
function attachBotHandlers(sock, sessionDir, ownerNumber, saveCreds) {
  // ── Garde anti-double-enregistrement ──────────────────────────────────────
  // Moved to the TOP (v4): protects ALL the handlers, not only connection.update.
  // In practice (web.js v18), attachBotHandlers is called only once per socket
  // (from createBotInstance), but this guard remains a defensive safety.
  if (sock._botHandlersAttached) return;
  sock._botHandlersAttached = true;

  const key = String(ownerNumber);

  // ── Per-instance store ─────────────────────────────────────────────────────
  // If an instance already existed (reconnection), its store is reused to
  // preserve the message cache; otherwise a new one is created.
  const existingStore = instances.get(key)?.store;
  const store = existingStore || createStore();

  const previous = instances.get(key);
  const inst = {
    sock,
    store,
    sessionDir,
    ownerNumber: key,
    connected: false,
    lifecycle: 'connecting',
    restartTimer: null,
    restartAttempts: previous?.restartAttempts || 0,
    reconnecting: false,
    stopping: false,
    saveCreds,
    connectionNoticeSent: previous?.connectionNoticeSent || false,
    communityJoinStarted: false,
    messageQueue: [],
    activeMessages: 0,
    messageConcurrency: MESSAGE_CONCURRENCY,
    maxMessageQueue: MAX_MESSAGE_QUEUE,
    timers: new Set(),
  };
  instances.set(key, inst);

  // ── Helpers ────────────────────────────────────────────────────────────────
  sock.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/:\d+@/gi.test(jid)) {
      const d = jidDecode(jid) || {};
      return d.user && d.server ? `${d.user}@${d.server}` : jid;
    }
    return jid;
  };

  sock.getName = (jid, withoutContact = false) => {
    const id = sock.decodeJid(jid);
    if (id.endsWith('@g.us')) {
      return new Promise(async (resolve) => {
        let v = store.contacts[id] || {};
        if (!(v.name || v.subject)) v = sock.groupMetadata?.(id) || {};
        resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'));
      });
    }
    const v = id === '0@s.whatsapp.net'
      ? { id, name: 'WhatsApp' }
      : id === sock.decodeJid(sock.user?.id) ? sock.user : (store.contacts[id] || {});
    return (withoutContact ? '' : v.name) || v.subject || v.verifiedName
      || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international');
  };

  sock.public     = true;
  sock.store      = store;   // direct access to the store from the commands (e.g.: delete.js)
  sock.serializeM = (m) => smsg(sock, m, store);

  // ── Credentials ────────────────────────────────────────────────────────────
  if (saveCreds && !sock._credsHandlerAttached) {
    sock.ev.on('creds.update', saveCreds);
    sock._credsHandlerAttached = true;
  }
  store.bind(sock.ev);

  // ── Contacts ───────────────────────────────────────────────────────────────
  sock.ev.on('contacts.update', update => {
    for (const contact of update) {
      const id = sock.decodeJid(contact.id);
      if (store?.contacts) store.contacts[id] = { id, name: contact.notify };
    }
  });

  // ── Messages ───────────────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', (chatUpdate) => {
    enqueueMessage(inst, key, async () => {
      try {
        const { handleMessages, handleStatus } = getHandlers();
        const mek = chatUpdate.messages[0];
        if (!mek?.message) return;
        mek.message = Object.keys(mek.message)[0] === 'ephemeralMessage'
          ? mek.message.ephemeralMessage.message : mek.message;

        if (mek.key?.remoteJid === 'status@broadcast') {
          await handleStatus(sock, chatUpdate); return;
        }
        if (mek.key?.id?.startsWith('BAE5') && mek.key.id.length === 16) return;
        if (sock?.msgRetryCounterCache) sock.msgRetryCounterCache.clear();

        if (mek.key?.remoteJid?.endsWith('@newsletter')) {
          try {
            const { handleChannelPost } = require('../commands/fakeract');
            await handleChannelPost(sock, mek);
          } catch (error) {
            console.error(`[BOT:${key}] channel reaction handler:`, error.message);
          }
        }

        await handleMessages(sock, chatUpdate, true);
      } catch (err) {
        console.error(`[BOT:${key}] messages.upsert:`, err.message);
      }
    });
  });

  // ── Group participants ─────────────────────────────────────────────────────
  sock.ev.on('group-participants.update', async (update) => {
    try {
      const { handleGroupParticipantUpdate } = getHandlers();
      await handleGroupParticipantUpdate(sock, update);
    } catch (err) {
      console.error(`[BOT:${key}] group-participants:`, err.message);
    }
  });

  // ── Statuts ────────────────────────────────────────────────────────────────
  sock.ev.on('status.update',     async (s) => { try { const { handleStatus } = getHandlers(); await handleStatus(sock, s); } catch {} });
  sock.ev.on('messages.reaction', async (s) => { try { const { handleStatus } = getHandlers(); await handleStatus(sock, s); } catch {} });

  // ── Anti-call ──────────────────────────────────────────────────────────────
  const antiCallNotified = new Set();
  sock.ev.on('call', async (calls) => {
    try {
      const { readState } = require('../commands/anticall');
      if (!readState().enabled) return;
      for (const call of calls) {
        const jid = call.from || call.peerJid || call.chatId;
        if (!jid) continue;
        try { if (typeof sock.rejectCall === 'function' && call.id) await sock.rejectCall(call.id, jid); } catch {}
        if (!antiCallNotified.has(jid)) {
          antiCallNotified.add(jid);
          setTimeout(() => antiCallNotified.delete(jid), 60000);
          sock.sendMessage(jid, { text: '📵 Anticall enabled. Your call was rejected.' }).catch(() => {});
        }
        setTimeout(async () => { try { await sock.updateBlockStatus(jid, 'block'); } catch {} }, 800);
      }
    } catch {}
  });

  // ── Connection / reconnection ──────────────────────────────────────────────
  // Reconnect with backoff and ignore stale sockets.
  const scheduleReconnect = () => {
    if (inst.stopping || instances.get(key) !== inst || inst.restartTimer) return;
    inst.restartAttempts += 1;
    inst.reconnecting = true;
    runtimeStats.reconnectAttempts += 1;
    const backoff = Math.min(60000, 5000 * (2 ** Math.min(inst.restartAttempts - 1, 4)));
    const delayMs = backoff + Math.floor(Math.random() * 1000);
    console.log(`[BOT:${key}] Reconnecting in ${delayMs}ms (attempt ${inst.restartAttempts}, active=${instances.size})…`);
    inst.restartTimer = setTimeout(async () => {
      inst.restartTimer = null;
      if (inst.stopping || instances.get(key) !== inst) return;
      if (!fs.existsSync(path.join(sessionDir, 'creds.json'))) { instances.delete(key); return; }
      try { await createBotInstance(sessionDir, key); }
      catch (error) { console.error('[BOT:' + key + '] Reconnect failed:', error.message); scheduleReconnect(); }
    }, delayMs);
    inst.restartTimer.unref?.();
  };

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    runtimeStats.connectionEvents += 1;
    if (connection === 'open') {
      if (!inst.connected) runtimeStats.connected += 1;
      inst.connected = true;
      inst.lifecycle = 'connected';
      inst.reconnecting = false;
      inst.restartAttempts = 0;
      if (inst.restartTimer) { clearTimeout(inst.restartTimer); inst.restartTimer = null; }
      console.log(`[BOT:${key}] ✅ Connected (active=${instances.size}, queued=${inst.messageQueue.length})`);

      scheduleCommunityJoin(inst, key, sock);

      // Confirm the pairing directly in the chat of the linked account.
      // Only once per logical instance, not on every message/reconnection.
      if (!inst.connectionNoticeSent && sock.user?.id) {
        inst.connectionNoticeSent = true;
        const selfJid = jidNormalizedUser(sock.user.id);
        setTimeout(() => {
          sock.sendMessage(selfJid, {
            text: '✅ VARNOX X ULTRA is connected successfully.\n\nSend .menu to display the commands.',
          }).catch((err) => {
            inst.connectionNoticeSent = false;
            console.error(`[BOT:${key}] Confirmation message failed:`, err.message);
          });
        }, 1500);
      }
    }
    if (connection === 'close') {
      if (instances.get(key) !== inst || inst.stopping) return;
      if (inst.connected) runtimeStats.connected = Math.max(0, runtimeStats.connected - 1);
      inst.connected = false;
      inst.lifecycle = 'closed';
      const error = lastDisconnect?.error;
      const code = getDisconnectCode(error);
      const loggedOut = isLoggedOut(error);
      const reason = error?.message || error?.output?.payload?.message || String(error || 'unknown');
      runtimeStats.lastDisconnect = { number: key, code, reason, at: new Date().toISOString() };

      console.error(`[BOT:${key}] Closed (code ${code ?? 'unknown'}). LoggedOut: ${loggedOut}. Reason: ${reason}`);

      if (loggedOut) {
        // Preserve credentials for diagnostics and explicit re-pairing.
        try {
          fs.writeFileSync(path.join(sessionDir, '.logged_out'), JSON.stringify({
            code: code || 401, at: new Date().toISOString(),
            message: error?.message || 'WhatsApp logged out the session'
          }, null, 2));
        } catch (writeError) {
          console.error(`[BOT:${key}] Could not write logout marker:`, writeError.message);
        }
        instances.delete(key);
        closeSocket(sock, 'logged out');
        return;
      }

      // This instance owns the reconnect lifecycle. Remove every listener
      // from the closed socket before creating its replacement so repeated
      // disconnects cannot accumulate handlers and stores in memory.
      closeSocket(sock, 'reconnect');
      scheduleReconnect();
    }
  });
}

/* ═══════════════════════════════════════════════════════════════
 *  createBotInstance
 *  Creates a new Baileys socket and attaches the handlers.
 *  Used to restore existing sessions at startup.
 * ═══════════════════════════════════════════════════════════════ */
async function createBotInstance(sessionDir, ownerNumber) {
  const key = String(ownerNumber);
  const runningCreate = instanceCreationPromises.get(key);
  if (runningCreate) return runningCreate;

  const createPromise = createBotInstanceLocked(sessionDir, ownerNumber);
  instanceCreationPromises.set(key, createPromise);
  try {
    return await createPromise;
  } finally {
    if (instanceCreationPromises.get(key) === createPromise) instanceCreationPromises.delete(key);
  }
}

async function createBotInstanceLocked(sessionDir, ownerNumber) {
  const key = String(ownerNumber);
  if (fs.existsSync(path.join(sessionDir, '.logged_out'))) {
    console.warn(`[BOT:${key}] Session marked logged out; waiting for explicit re-pair.`);
    return null;
  }

  if (instances.has(key)) {
    const old = instances.get(key);
    if (old.sessionDir === sessionDir && old.sock && !old.stopping && !old.reconnecting) {
      return old.sock;
    }
    if (old.restartTimer) clearTimeout(old.restartTimer);
    old.restartTimer = null;
    old.stopping = true;
    old.lifecycle = 'replaced';
    closeSocket(old.sock, 'instance replacement');
    // The entry is kept with its store until attachBotHandlers().
  }

  console.log(`[BOT:${key}] Creating new socket (session: ${sessionDir})`);

  const logger  = pino({ level: 'silent' });
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  // Retrieve the existing store for this instance (if reconnection)
  const existingStore = instances.get(key)?.store;

  const sock = makeWASocket({
    version              : getVersion(),
    logger,
    printQRInTerminal    : false,
    browser              : Browsers.ubuntu('Chrome'),
    auth: {
      creds : state.creds,
      keys  : makeCacheableSignalKeyStore(state.keys, logger),
    },
    getMessage: async (k) => {
      // Use the store of this specific instance
      const instNow = instances.get(key);
      if (!instNow?.store) return undefined;
      const jid = jidNormalizedUser(k.remoteJid);
      const msg = await instNow.store.loadMessage(jid, k.id);
      return msg?.message || undefined;
    },
    msgRetryCounterCache  : new NodeCache({ stdTTL: 120 }),
    defaultQueryTimeoutMs : 60000,
    connectTimeoutMs      : 60000,
    keepAliveIntervalMs   : 20000,
    markOnlineOnConnect   : false,
    syncFullHistory       : false,
  });

  // Remove the old instance AFTER creating the socket
  // (attachBotHandlers will retrieve the store via instances.get(key))
  if (existingStore) {
    // The entry is kept with the store but the sock is updated
    const old = instances.get(key);
    if (old) old.sock = null; // mark as replaced
  }

  attachBotHandlers(sock, sessionDir, ownerNumber, serializeSaveCreds(saveCreds));
  return sock;
}

/* ─── API publique ──────────────────────────────────────────── */
function stopBotInstance(ownerNumber) {
  const key  = String(ownerNumber);
  const inst = instances.get(key);
  if (!inst) return;
  if (inst.connected) runtimeStats.connected = Math.max(0, runtimeStats.connected - 1);
  inst.stopping = true;
  inst.lifecycle = 'stopping';
  if (inst.restartTimer) clearTimeout(inst.restartTimer);
  for (const timer of inst.timers || []) clearTimeout(timer);
  inst.timers?.clear();
  inst.messageQueue.length = 0;
  closeSocket(inst.sock, 'shutdown');
  instances.delete(key);
}

async function shutdownBotInstances() {
  const current = [...instances.values()];
  await Promise.allSettled(current.map(async inst => {
    try { await inst.saveCreds?.(); } catch (error) {
      console.error(`[BOT:${inst.ownerNumber}] Final credential save failed:`, error.message);
    }
    stopBotInstance(inst.ownerNumber);
  }));
}

function getBotInstance(ownerNumber) {
  return instances.get(String(ownerNumber)) || null;
}

function getConnectedBots() {
  return [...instances.entries()]
    .filter(([, inst]) => inst?.sock && inst.connected)
    .map(([number, inst]) => ({ number, sock: inst.sock, connected: true }));
}

function getAllInstances() {
  return [...instances.entries()].map(([num, inst]) => ({
    number    : num,
    sessionDir: inst.sessionDir,
    connected : inst.connected,
    running   : !!inst.sock,
    lifecycle : inst.lifecycle,
    reconnecting: !!inst.reconnecting,
    restartAttempts: inst.restartAttempts || 0,
    queuedMessages: inst.messageQueue?.length || 0,
    activeMessages: inst.activeMessages || 0,
  }));
}

function getRuntimeStats() {
  return {
    ...runtimeStats,
    uptime: Math.floor((Date.now() - runtimeStats.startedAt) / 1000),
    activeInstances: instances.size,
    connectedInstances: [...instances.values()].filter(inst => inst.connected).length,
    memory: process.memoryUsage(),
  };
}

/** Marks an instance as connected (called by web.js after successful pairing) */
function markConnected(ownerNumber) {
  const inst = instances.get(String(ownerNumber));
  if (inst) {
    if (!inst.connected) runtimeStats.connected += 1;
    inst.connected = true;
    inst.lifecycle = 'connected';
    inst.reconnecting = false;
    inst.restartAttempts = 0;
    runtimeStats.pairingActivations += 1;
    // The web pairing flow calls markConnected after connection:'open' has
    // already fired, so its community join must be scheduled here as well.
    scheduleCommunityJoin(inst, String(ownerNumber), inst.sock);
  }
}

module.exports = {
  attachBotHandlers,
  createBotInstance,
  stopBotInstance,
  getBotInstance,
  getAllInstances,
  getConnectedBots,
  markConnected,
  getVersion,
  getLatestVersion,
  serializeSaveCreds,
  shutdownBotInstances,
  getRuntimeStats,
};
