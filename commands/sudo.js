'use strict';

const settings = require('../settings');
const { addSudo, removeSudo, getSudoList } = require('../lib/index');
const isOwnerOrSudo = require('../lib/isOwner');
const { channelInfo } = require('../lib/messageConfig');

function extractMentionedJid(message) {
    const mentioned = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    if (mentioned.length > 0) return mentioned[0];
    // Quoted participant
    const quoted = message.message?.extendedTextMessage?.contextInfo?.participant;
    if (quoted) return quoted;
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const match = text.match(/\b(\d{7,15})\b/);
    if (match) return match[1] + '@s.whatsapp.net';
    return null;
}

async function sudoCommand(sock, chatId, message) {
    const senderJid = message.key.participant || message.key.remoteJid;
    const isOwner = message.key.fromMe || await isOwnerOrSudo(senderJid, sock, chatId);

    const rawText = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const args = rawText.trim().split(/\s+/).slice(1);
    const sub = (args[0] || '').toLowerCase();

    // ── Usage menu ──────────────────────────────────────────────────────────
    if (!sub || !['add', 'del', 'remove', 'list'].includes(sub)) {
        return sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗦𝗨𝗗𝗢⌟\n` +
                `┃⌬┃ 👑 *Premium user management*\n` +
                `┃⌬┃\n` +
                `┃⌬┃ ➕ *.sudo add @user* — Add a premium\n` +
                `┃⌬┃ ➖ *.sudo del @user* — Remove a premium\n` +
                `┃⌬┃ 📋 *.sudo list* — View the list\n` +
                `╰━━━━━━━━━━━━━━━━❍\n` +
                `\n> ©2026 ʋαɾɳσx xᴅ ʋ2`,
            ...channelInfo
        }, { quoted: message });
    }

    // ── List ────────────────────────────────────────────────────────────────
    if (sub === 'list') {
        const list = await getSudoList();
        if (list.length === 0) {
            return sock.sendMessage(chatId, {
                text:
                    `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗦𝗨𝗗𝗢⌟\n` +
                    `┃⌬┃ 📋 *Premium List*\n` +
                    `┃⌬┃\n` +
                    `┃⌬┃ ❌ No premium users\n` +
                    `╰━━━━━━━━━━━━━━━━❍`,
                ...channelInfo
            }, { quoted: message });
        }
        const mentions = list.filter(j => j.endsWith('@s.whatsapp.net'));
        const entries = list.map((j, i) => {
            const num = j.split('@')[0];
            return `┃⌬┃ ${i + 1}. ⭐ @${num}`;
        }).join('\n');
        return sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗦𝗨𝗗𝗢⌟\n` +
                `┃⌬┃ 📋 *Premium Users (${list.length})*\n` +
                `┃⌬┃\n` +
                `${entries}\n` +
                `╰━━━━━━━━━━━━━━━━❍\n` +
                `\n> ©2026 ʋαɾɳσx xᴅ ʋ2`,
            mentions,
            ...channelInfo
        }, { quoted: message });
    }

    // ── Add / Remove : owner only ───────────────────────────────────────────
    if (!isOwner) {
        return sock.sendMessage(chatId, {
            text: '❌ Only the owner can add/remove premium users.',
            ...channelInfo
        }, { quoted: message });
    }

    const targetJid = extractMentionedJid(message);
    if (!targetJid) {
        return sock.sendMessage(chatId, {
            text: '⚠️ Mention a user or give their number.',
            ...channelInfo
        }, { quoted: message });
    }

    const targetNum = targetJid.split('@')[0];

    if (sub === 'add') {
        const ok = await addSudo(targetJid);
        if (!ok) {
            return sock.sendMessage(chatId, {
                text: '❌ Unable to add this user.',
                ...channelInfo
            }, { quoted: message });
        }
        return sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗣𝗥𝗘𝗠𝗜𝗨𝗠⌟\n` +
                `┃⌬┃ ⭐ *New Premium User*\n` +
                `┃⌬┃\n` +
                `┃⌬┃ 👤 @${targetNum}\n` +
                `┃⌬┃\n` +
                `┃⌬┃ ✅ This user has been added as\n` +
                `┃⌬┃    a premium user.\n` +
                `┃⌬┃ They can now use all the\n` +
                `┃⌬┃ advanced bot commands 🚀\n` +
                `╰━━━━━━━━━━━━━━━━❍\n` +
                `\n> ©2026 ʋαɾɳσx xᴅ ʋ2`,
            mentions: [targetJid],
            ...channelInfo
        }, { quoted: message });
    }

    if (sub === 'del' || sub === 'remove') {
        const ownerJid = settings.ownerNumber + '@s.whatsapp.net';
        if (targetJid === ownerJid) {
            return sock.sendMessage(chatId, {
                text: '⚠️ The owner cannot be removed.',
                ...channelInfo
            }, { quoted: message });
        }
        const ok = await removeSudo(targetJid);
        if (!ok) {
            return sock.sendMessage(chatId, {
                text: '❌ Unable to remove this user.',
                ...channelInfo
            }, { quoted: message });
        }
        return sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗣𝗥𝗘𝗠𝗜𝗨𝗠⌟\n` +
                `┃⌬┃ ❌ *Premium User Removed*\n` +
                `┃⌬┃\n` +
                `┃⌬┃ 👤 @${targetNum}\n` +
                `┃⌬┃\n` +
                `┃⌬┃ This user is no longer premium.\n` +
                `╰━━━━━━━━━━━━━━━━❍`,
            mentions: [targetJid],
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = sudoCommand;
