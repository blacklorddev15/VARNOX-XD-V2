'use strict';

const fs = require('fs');
const path = require('path');

const MUTED_FILE = path.join(__dirname, '../data/muted.json');

function readMutedUsers() {
    try {
        if (!fs.existsSync(MUTED_FILE)) return {};
        const data = JSON.parse(fs.readFileSync(MUTED_FILE, 'utf8'));
        return data && typeof data === 'object' ? data : {};
    } catch (error) {
        console.error('[mute] unable to read muted.json:', error.message);
        return {};
    }
}

function writeMutedUsers(data) {
    fs.mkdirSync(path.dirname(MUTED_FILE), {recursive: true});
    const tempFile = MUTED_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
    fs.renameSync(tempFile, MUTED_FILE);
}

function normalizeJid(jid) {
    if (!jid || typeof jid !== 'string') return '';
    return jid.trim().replace(/^@/, '');
}

function getTargetJids(message, mentionedJids = []) {
    const targets = Array.isArray(mentionedJids) ? mentionedJids.filter(Boolean) : [];
    const quotedParticipant = message?.message?.extendedTextMessage?.contextInfo?.participant;
    if (quotedParticipant) targets.push(quotedParticipant);
    return [...new Set(targets.map(normalizeJid).filter(jid => jid.includes('@')))].slice(0, 10);
}

function removeExpired(store, chatId) {
    const group = store[chatId];
    if (!group) return false;
    const now = Date.now();
    let changed = false;
    for (const [jid, expiresAt] of Object.entries(group)) {
        if (expiresAt && expiresAt <= now) {
            delete group[jid];
            changed = true;
        }
    }
    if (Object.keys(group).length === 0) delete store[chatId];
    return changed;
}

function isMuted(chatId, jid) {
    const store = readMutedUsers();
    const changed = removeExpired(store, chatId);
    if (changed) writeMutedUsers(store);
    return Boolean(store[chatId]?.[normalizeJid(jid)] !== undefined);
}

function setMuted(chatId, jids, durationInMinutes) {
    const store = readMutedUsers();
    if (!store[chatId]) store[chatId] = {};
    const expiresAt = durationInMinutes > 0 ? Date.now() + durationInMinutes * 60 * 1000 : 0;
    for (const jid of jids) store[chatId][normalizeJid(jid)] = expiresAt;
    writeMutedUsers(store);
}

function clearMuted(chatId, jids) {
    const store = readMutedUsers();
    let removed = false;
    for (const jid of jids) {
        const key = normalizeJid(jid);
        if (store[chatId]?.[key] !== undefined) {
            delete store[chatId][key];
            removed = true;
        }
    }
    if (store[chatId] && Object.keys(store[chatId]).length === 0) delete store[chatId];
    if (removed) writeMutedUsers(store);
    return removed;
}

async function muteCommand(sock, chatId, senderId, message, durationInMinutes, mentionedJids = []) {
    try {
        const targets = getTargetJids(message, mentionedJids);
        if (targets.length > 0) {
            setMuted(chatId, targets, durationInMinutes);
            const names = targets.map(jid => '@' + jid.split('@')[0]).join(', ');
            const duration = durationInMinutes > 0 ? ' for ' + durationInMinutes + ' minute(s)' : '';
            const verb = targets.length > 1 ? 'are' : 'is';
            const subject = targets.length > 1 ? 'these users' : 'this user';
            await sock.sendMessage(chatId, {
                text: '🔇 ' + names + ' ' + verb + ' now muted' + duration + '.\n\nMessages from ' + subject + ' will be deleted until .unmute.',
                mentions: targets
            }, {quoted: message});
            return;
        }

        // Backward compatible: without a target, .mute closes the whole group.
        await sock.groupSettingUpdate(chatId, 'announcement');
        if (durationInMinutes > 0) {
            await sock.sendMessage(chatId, {text: '🔇 The group is closed for ' + durationInMinutes + ' minute(s).'}, {quoted: message});
            setTimeout(async () => {
                try {
                    await sock.groupSettingUpdate(chatId, 'not_announcement');
                    await sock.sendMessage(chatId, {text: '🔊 The group is open again.'});
                } catch (error) {
                    console.error('[mute] error while reopening:', error.message);
                }
            }, durationInMinutes * 60 * 1000);
        } else {
            await sock.sendMessage(chatId, {text: '🔇 The group is now muted. Use .unmute to reopen it.'}, {quoted: message});
        }
    } catch (error) {
        console.error('[mute] error:', error);
        await sock.sendMessage(chatId, {text: '❌ Failed to apply the mute. Check that the bot is an administrator.'}, {quoted: message});
    }
}

muteCommand.isMuted = isMuted;
muteCommand.getTargetJids = getTargetJids;
muteCommand.clearMuted = clearMuted;

module.exports = muteCommand;
