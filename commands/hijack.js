'use strict';

const fs = require('fs');
const path = require('path');
const isAdmin = require('../lib/isAdmin');
const { channelInfo } = require('../lib/messageConfig');

const STATE_FILE = path.join(__dirname, '../data/hijack.json');
const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_MESSAGE = '🛑 𝗛𝗜𝗝𝗔𝗖𝗞 𝗔𝗖𝗧𝗜𝗩𝗘\n🔐 Group temporarily locked.\n⚡ Control: 𝗩꯭𝗔꯭𝗥꯭𝗡꯭𝗢꯭𝗫꯭͡ 𝗫꯭𝗧꯭𝗘꯭𝗖꯭𝗛꯭͡\n🛡️ Security mode enabled.';
const expiryTimers = new Map();

function ensureStateFile() {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, '{}');
}

function readState() {
    ensureStateFile();
    try {
        const value = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        return value && typeof value === 'object' ? value : {};
    } catch (error) {
        console.error('[hijack] unable to read:', error.message);
        return {};
    }
}

function writeState(state) {
    ensureStateFile();
    const temp = STATE_FILE + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(state, null, 2));
    fs.renameSync(temp, STATE_FILE);
}

function getRecord(state, chatId) {
    const existing = state[chatId] && typeof state[chatId] === 'object' ? state[chatId] : {};
    return {
        enabled: Boolean(existing.enabled),
        until: Number.isFinite(existing.until) && existing.until > 0 ? existing.until : null,
        message: typeof existing.message === 'string' && existing.message.trim() ? existing.message : DEFAULT_MESSAGE
    };
}

async function send(sock, chatId, message, text) {
    return sock.sendMessage(chatId, { text, ...channelInfo }, message ? { quoted: message } : undefined);
}

function clearExpiry(chatId) {
    const timer = expiryTimers.get(chatId);
    if (timer) clearTimeout(timer);
    expiryTimers.delete(chatId);
}

function scheduleExpiry(sock, chatId, until) {
    clearExpiry(chatId);
    if (!until) return;
    const wait = Math.max(0, Math.min(until - Date.now(), 2147483647));
    const timer = setTimeout(async () => {
        expiryTimers.delete(chatId);
        if (Date.now() < until) return scheduleExpiry(sock, chatId, until);
        await expireHijack(sock, chatId);
    }, wait);
    expiryTimers.set(chatId, timer);
}

async function expireHijack(sock, chatId) {
    const state = readState();
    const record = getRecord(state, chatId);
    if (!record.enabled || !record.until || record.until > Date.now()) {
        if (record.enabled && record.until) scheduleExpiry(sock, chatId, record.until);
        return;
    }
    try {
        await sock.groupSettingUpdate(chatId, 'not_announcement');
    } catch (error) {
        console.error('[hijack] automatic unlock failed:', error.message);
        scheduleExpiry(sock, chatId, Date.now() + 10000);
        return;
    }
    record.enabled = false;
    record.until = null;
    state[chatId] = record;
    writeState(state);
    await send(sock, chatId, null, '🔓 HIJACK finished. The group is open again.');
}

function parseDuration(value) {
    const match = String(value || '').trim().toLowerCase().match(/^(\d+)(s|m|h|d)$/);
    if (!match) return null;
    const amount = Number(match[1]);
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const duration = amount * multipliers[match[2]];
    if (!Number.isSafeInteger(duration) || duration <= 0 || duration > MAX_DURATION_MS) return null;
    return duration;
}

function formatDuration(ms) {
    const seconds = Math.ceil(ms / 1000);
    if (seconds % 86400 === 0) return Math.round(seconds / 86400) + 'j';
    if (seconds % 3600 === 0) return Math.round(seconds / 3600) + 'h';
    if (seconds % 60 === 0) return Math.round(seconds / 60) + 'min';
    return seconds + 's';
}

async function requirePermissions(sock, chatId, message, owner) {
    const senderId = message.key.participant || message.key.remoteJid;
    const status = await isAdmin(sock, chatId, senderId);
    if (!owner && !status.isSenderAdmin) {
        await send(sock, chatId, message, '❌ This command is reserved for admins.');
        return null;
    }
    if (!status.isBotAdmin) {
        await send(sock, chatId, message, '❌ The bot must be an admin before using HIJACK.');
        return null;
    }
    return status;
}

function jidNumber(jid) {
    return String(jid || '').split(':')[0].split('@')[0];
}

function botParticipantId(sock) {
    return jidNumber(sock.user?.id || sock.user?.jid);
}

/**
 * HIJACK must strip admin privileges before closing the group.
 * The superadmin/creator and some protected accounts may be refused
 * by WhatsApp: an individual error must not prevent the lock.
 */
async function demoteGroupAdmins(sock, chatId) {
    let metadata;
    try {
        metadata = await sock.groupMetadata(chatId);
    } catch (error) {
        console.error('[hijack] metadata unavailable for demotion:', error.message);
        return 0;
    }

    const botId = botParticipantId(sock);
    const targets = (metadata.participants || [])
        .filter(participant => participant.admin === 'admin')
        .map(participant => participant.id || participant.jid)
        .filter(Boolean)
        .filter(jid => jidNumber(jid) !== botId);

    if (!targets.length) return 0;

    try {
        await sock.groupParticipantsUpdate(chatId, targets, 'demote');
        return targets.length;
    } catch (error) {
        console.error('[hijack] bulk demotion refused:', error.message);
        let demoted = 0;
        for (const jid of targets) {
            try {
                await sock.groupParticipantsUpdate(chatId, [jid], 'demote');
                demoted += 1;
            } catch (individualError) {
                console.error(`[hijack] unable to demote ${jid}:`, individualError.message);
            }
        }
        return demoted;
    }
}

function usage() {
    return '🛡️ *HIJACK*\n' +
        '• .hijack — lock the group\n' +
        '• .hijack 10m / 1h — lock temporarily\n' +
        '• .hijack status — view the status\n' +
        '• .hijack set message — set the group message\n' +
        '• .hijack reset — reset the message to default\n' +
        '• .hijack off — disable and unlock';
}

async function handleHijackCommand(sock, chatId, message, args = [], owner = false) {
    if (!chatId.endsWith('@g.us')) {
        await send(sock, chatId, message, '❌ This command only works in groups.');
        return true;
    }
    if (!await requirePermissions(sock, chatId, message, owner)) return true;

    const state = readState();
    const record = getRecord(state, chatId);
    const action = String(args[0] || '').trim().toLowerCase();

    if (record.enabled && record.until && record.until <= Date.now()) {
        await expireHijack(sock, chatId);
    } else if (record.enabled && record.until) {
        scheduleExpiry(sock, chatId, record.until);
    }

    if (action === 'status') {
        const current = getRecord(readState(), chatId);
        const remaining = current.enabled && current.until ? '\n⏱️ Time remaining: ' + formatDuration(current.until - Date.now()) : '';
        await send(sock, chatId, message, current.enabled
            ? '🛡️ HIJACK : *ACTIVE*\n🔐 Group locked.' + remaining
            : '🛡️ HIJACK : *INACTIVE*\n🔓 Group open.');
        return true;
    }

    if (action === 'off') {
        try {
            await sock.groupSettingUpdate(chatId, 'not_announcement');
        } catch (error) {
            console.error('[hijack] unlock failed:', error.message);
            await send(sock, chatId, message, '❌ Failed to unlock the group.');
            return true;
        }
        clearExpiry(chatId);
        record.enabled = false;
        record.until = null;
        state[chatId] = record;
        writeState(state);
        await send(sock, chatId, message, '✅ HIJACK disabled. The group is open again.');
        return true;
    }

    if (action === 'set') {
        const customMessage = args.slice(1).join(' ').trim();
        if (!customMessage) {
            await send(sock, chatId, message, '❌ Usage: .hijack set Your custom message');
            return true;
        }
        record.message = customMessage;
        state[chatId] = record;
        writeState(state);
        await send(sock, chatId, message, '✅ HIJACK message saved for this group.');
        return true;
    }

    if (action === 'reset') {
        record.message = DEFAULT_MESSAGE;
        state[chatId] = record;
        writeState(state);
        await send(sock, chatId, message, '✅ HIJACK message reset to default.');
        return true;
    }

    const duration = action ? parseDuration(action) : null;
    if (action && !duration) {
        await send(sock, chatId, message, usage());
        return true;
    }

    await demoteGroupAdmins(sock, chatId);
    try {
        await sock.groupSettingUpdate(chatId, 'announcement');
    } catch (error) {
        console.error('[hijack] lock failed:', error.message);
        await send(sock, chatId, message, '❌ Failed to lock the group.');
        return true;
    }

    clearExpiry(chatId);
    record.enabled = true;
    record.until = duration ? Date.now() + duration : null;
    state[chatId] = record;
    writeState(state);
    if (record.until) scheduleExpiry(sock, chatId, record.until);

    await send(sock, chatId, message, record.message);
    if (duration) await send(sock, chatId, message, '⏱️ HIJACK active for *' + formatDuration(duration) + '*.');
    return true;
}

function restoreHijackTimers(sock) {
    const state = readState();
    for (const chatId of Object.keys(state)) {
        const record = getRecord(state, chatId);
        if (!record.enabled || !record.until) continue;
        if (record.until <= Date.now()) expireHijack(sock, chatId).catch(error => console.error('[hijack] restore failed:', error.message));
        else scheduleExpiry(sock, chatId, record.until);
    }
}

module.exports = { DEFAULT_MESSAGE, handleHijackCommand, restoreHijackTimers };
