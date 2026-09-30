'use strict';

const fs = require('fs');
const path = require('path');
const { channelInfo } = require('../lib/messageConfig');

const STATE_FILE = path.join(__dirname, '../data/fakeract.json');
const REACTIONS = ['❤️', '👍', '🔥', '😂', '😮', '👏', '🎉', '💯', '😍', '🤯', '🙏', '✨'];
const CHANNEL_LINK = /^(?:https?:\/\/)?(?:www\.)?(?:whatsapp\.com|wa\.me)\/channel\/([^/?#\s]+)\/(\d+)(?:[/?#].*)?$/i;
const pendingReactions = new Set();
const DEFAULT_TARGET = 30;
const PRIMARY_CHANNEL_JID = process.env.PRIMARY_CHANNEL_JID || '120363424782348922@newsletter';

function connectedBots(fallbackSock) {
    let bots = [];
    try { bots = require('../lib/botInstance').getConnectedBots(); } catch (_) {}
    const result = bots.filter(item => item?.sock).map(item => ({ number: String(item.number || botKey(item.sock)), sock: item.sock }));
    if (fallbackSock && !result.some(item => item.sock === fallbackSock)) result.unshift({ number: botKey(fallbackSock), sock: fallbackSock });
    return result;
}

async function followChannel(sock, newsletterJid) {
    if (!sock || !newsletterJid) return;
    try {
        if (typeof sock.subscribeNewsletterUpdates === 'function') await sock.subscribeNewsletterUpdates(newsletterJid);
        else if (typeof sock.newsletterFollow === 'function') await sock.newsletterFollow(newsletterJid);
    } catch (error) { console.warn('[fakeract] subscription failed:', error.message); }
}

function parseChannelLink(value) {
    const match = String(value || '').trim().match(CHANNEL_LINK);
    if (!match) return null;
    return { inviteCode: match[1], serverMessageId: match[2] };
}

function readState() {
    try {
        if (!fs.existsSync(STATE_FILE)) return {};
        const value = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        return value && typeof value === 'object' ? value : {};
    } catch {
        return {};
    }
}

function writeState(state) {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    const temp = `${STATE_FILE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state, null, 2));
    fs.renameSync(temp, STATE_FILE);
}

function botKey(sock) {
    return String(sock.user?.id || sock.user?.jid || 'default')
        .split(':')[0]
        .split('@')[0];
}

async function send(sock, chatId, message, text) {
    return sock.sendMessage(chatId, { text, ...channelInfo }, message ? { quoted: message } : undefined);
}

async function fakeReactCommand(sock, chatId, message, rawArgs = '') {
    const value = String(rawArgs || '').trim();
    const command = value.toLowerCase();
    const state = readState();

    if (command === 'off') {
        state.global = { enabled: false, disabledAll: true };
        writeState(state);
        await send(sock, chatId, message, '✅ Fakeract and automatic reactions are disabled.');
        return;
    }

    if (command === 'status') {
        const current = state.global?.enabled
            ? state.global
            : state.global?.disabledAll
                ? null
                : { enabled: true, channelJid: PRIMARY_CHANNEL_JID, reactionTarget: DEFAULT_TARGET };
        await send(
            sock,
            chatId,
            message,
            current?.enabled
                ? `📡 Fakeract active on ${current.channelJid}.\n🎯 Up to ${current.reactionTarget} connected accounts per post.`
                : 'ℹ️ Real-time Fakeract is disabled.'
        );
        return;
    }

    const pieces = value.split(/\s+/).filter(Boolean);
    const link = pieces.find(piece => parseChannelLink(piece));
    const target = parseChannelLink(link);
    const requested = Number(pieces.find(piece => /^(?:30|50)$/.test(piece)));
    const reactionTarget = requested === 50 ? 50 : DEFAULT_TARGET;
    if (!target) {
        await sock.sendMessage(chatId, {
            text: '❌ Use .fakeract with a WhatsApp channel post link.\nExample: .fakeract https://whatsapp.com/channel/XXXX/123\n\nAdd .fakeract off to stop tracking.',
            ...channelInfo
        }, { quoted: message });
        return;
    }

    if (typeof sock.newsletterMetadata !== 'function' ||
        typeof sock.newsletterReactMessage !== 'function') {
        await send(sock, chatId, message, '❌ This Baileys version does not support channel reactions.');
        return;
    }

    try {
        const metadata = await sock.newsletterMetadata('invite', target.inviteCode);
        const newsletterJid = metadata?.id || metadata?.jid;
        if (!newsletterJid) throw new Error('Channel not found');

        const bots = connectedBots(sock);
        await Promise.all(bots.map(bot => followChannel(bot.sock, newsletterJid)));

        state.global = {
            enabled: true,
            inviteCode: target.inviteCode,
            channelJid: newsletterJid,
            reactionTarget,
            nextEmoji: 0,
            reactedPosts: {},
            configuredAt: Date.now()
        };
        writeState(state);
        await send(
            sock,
            chatId,
            message,
            `✅ Fakeract enabled on ${newsletterJid}.\n📡 Each new post will be processed only once.\n🎯 Up to ${reactionTarget} connected accounts will react per post.`
        );
    } catch (error) {
        console.error('[fakeract] reaction failed:', error.message);
        await send(sock, chatId, message, `❌ Unable to configure this channel: ${error.message}`);
    }
}

async function handleChannelPost(sock, message) {
    const remoteJid = message?.key?.remoteJid;
    if (!remoteJid?.endsWith('@newsletter')) return false;

    const state = readState();
    const customConfig = state.global?.enabled && state.global.channelJid === remoteJid ? state.global : null;
    const mainConfig = remoteJid === PRIMARY_CHANNEL_JID && state.global?.disabledAll !== true
        ? (state.main || { enabled: true, channelJid: PRIMARY_CHANNEL_JID, reactionTarget: DEFAULT_TARGET, nextEmoji: 0, reactedPosts: {} })
        : null;
    const configKey = customConfig ? 'global' : mainConfig ? 'main' : null;
    const config = customConfig || mainConfig;
    if (!config?.enabled) return false;
    if (typeof sock.newsletterReactMessage !== 'function') return false;

    const serverMessageId = String(
        message.key.serverMessageId ||
        message.key.serverId ||
        message.key.server_id ||
        message.message?.messageContextInfo?.serverMessageId ||
        message.message?.messageContextInfo?.serverId ||
        message.message?.newsletterMessage?.serverMessageId ||
        ''
    );
    if (!/^\d+$/.test(serverMessageId)) {
        console.warn('[fakeract] post received without a usable serverMessageId');
        return false;
    }

    const eventKey = `${remoteJid}:${serverMessageId}`;
    if (pendingReactions.has(eventKey) || config.lastMessageId === serverMessageId) return false;
    pendingReactions.add(eventKey);
    try {
        if (!config.reactedPosts || typeof config.reactedPosts !== 'object') config.reactedPosts = {};
        const post = config.reactedPosts[serverMessageId] || { accounts: [] };
        const alreadyReacted = new Set(post.accounts || []);
        const bots = connectedBots(sock)
            .filter(bot => !alreadyReacted.has(bot.number))
            .slice(0, Math.max(1, Number(config.reactionTarget) || DEFAULT_TARGET));
        if (!bots.length) return false;
        for (const bot of bots) {
            const emoji = REACTIONS[Number(config.nextEmoji || 0) % REACTIONS.length];
            try {
                if (typeof bot.sock.newsletterReactMessage !== 'function') continue;
                await bot.sock.newsletterReactMessage(remoteJid, serverMessageId, emoji);
                post.accounts.push(bot.number);
                config.nextEmoji = (Number(config.nextEmoji || 0) + 1) % REACTIONS.length;
            } catch (error) {
                console.error('[fakeract] reaction failed for ' + bot.number + ':', error.message);
            }
        }
        config.reactedPosts[serverMessageId] = post;
        const postIds = Object.keys(config.reactedPosts);
        for (const oldId of postIds.slice(0, -50)) delete config.reactedPosts[oldId];
        state[configKey] = config;
        writeState(state);
        return post.accounts.length > 0;
    } finally {
        pendingReactions.delete(eventKey);
    }
}

module.exports = fakeReactCommand;
module.exports.handleChannelPost = handleChannelPost;
module.exports.parseChannelLink = parseChannelLink;