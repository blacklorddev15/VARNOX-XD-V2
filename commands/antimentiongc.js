'use strict';
const fs = require('fs');
const { channelInfo } = require('../lib/messageConfig');
const isAdmin = require('../lib/isAdmin');

const DATA_FILE = './data/antimentiongc.json';

function readState() {
    try {
        if (!fs.existsSync(DATA_FILE)) return {};
        return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || {};
    } catch { return {}; }
}

function writeState(state) {
    try {
        if (!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
    } catch {}
}

function isAntiMentionGcEnabled(chatId) {
    return !!readState()[chatId];
}

async function antiMentionGcCommand(sock, chatId, senderId, message, args) {
    if (!chatId.endsWith('@g.us')) {
        return sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔⌟\n` +
                `┃⌬┃ ❌ Groups only.\n` +
                `╰━━━━━━━━━━━━❍`,
            ...channelInfo
        }, { quoted: message });
    }

    const sub = (args || '').trim().toLowerCase();
    const state = readState();

    if (sub === 'on') {
        state[chatId] = true;
        writeState(state);
        return sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔⌟\n` +
                `┃⌬╭━━━━━━━━━━━━━≽\n` +
                `┃⌬┃ 📢 *ANTIMENTIONGC*\n` +
                `╰━━━━━━━━━━━━❍\n` +
                `    📢𝗔𝗡𝗡𝗢𝗡𝗖𝗘 ❍𝗙𝗙𝗜𝗖𝗜𝗔𝗟\n` +
                `┃⌬┃ ✅ Enabled! Messages\n` +
                `┃⌬┃ mentioning the group\n` +
                `┃⌬┃ will be auto-deleted.\n` +
                `╰━━━━━━━━━━━━❍\n` +
                `\n> ©2026 ʋαɾɳσx xᴅ ʋ2 ᴅҽʋҽʅσρҽԃ Ⴆყ ʋαɾɳσx ᴛᴇᴄʜ`,
            ...channelInfo
        }, { quoted: message });
    } else if (sub === 'off') {
        delete state[chatId];
        writeState(state);
        return sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔⌟\n` +
                `┃⌬┃ 📢 *ANTIMENTIONGC*\n` +
                `┃⌬┃ ❌ Disabled.\n` +
                `╰━━━━━━━━━━━━❍\n` +
                `\n> ©2026 ʋαɾɳσx xᴅ ʋ2 ᴅҽʋҽʅσρҽԃ Ⴆყ ʋαɾɳσx ᴛᴇᴄʜ`,
            ...channelInfo
        }, { quoted: message });
    } else {
        const enabled = !!state[chatId];
        return sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔⌟\n` +
                `┃⌬╭━━━━━━━━━━━━━≽\n` +
                `┃⌬┃ 📢 *ANTIMENTIONGC*\n` +
                `╰━━━━━━━━━━━━❍\n` +
                `┃⌬┃ Status : *${enabled ? '✅ Enabled' : '❌ Disabled'}*\n` +
                `┃⌬┃\n` +
                `┃⌬┃ Usage :\n` +
                `┃⌬┃ .antimentiongc on  — enable\n` +
                `┃⌬┃ .antimentiongc off — disable\n` +
                `╰━━━━━━━━━━━━❍\n` +
                `\n> ©2026 ʋαɾɳσx xᴅ ʋ2 ᴅҽʋҽʅσρҽԃ Ⴆყ ʋαɾɳσx ᴛᴇᴄʜ`,
            ...channelInfo
        }, { quoted: message });
    }
}

/**
 * Called for each message in a group.
 * Deletes the message if the member mentions the group (@all, @everyone,
 * or a @g.us JID in mentionedJid).
 */
async function handleAntiMentionGc(sock, chatId, message, senderId) {
    if (!chatId.endsWith('@g.us')) return false;
    if (!isAntiMentionGcEnabled(chatId)) return false;
    if (message.key.fromMe) return false;
    try {
        const adminStatus = await isAdmin(sock, chatId, senderId);
        if (adminStatus?.isSenderAdmin) return false;
    } catch (_) {}
    const unwrap = value => value?.ephemeralMessage?.message || value?.viewOnceMessage?.message || value;
    const msg = unwrap(message.message || {});

    // Collect all mentionedJid lists from known message types
    const contexts = [
        msg.extendedTextMessage?.contextInfo,
        msg.imageMessage?.contextInfo,
        msg.videoMessage?.contextInfo,
        msg.documentMessage?.contextInfo,
        msg.stickerMessage?.contextInfo,
        msg.buttonsResponseMessage?.contextInfo,
        msg.messageContextInfo,
        msg.listResponseMessage?.contextInfo,
    ].filter(Boolean);

    let mentionsGroup = false;

    for (const c of contexts) {
        if (Array.isArray(c.groupMentions) && c.groupMentions.length) {
            mentionsGroup = true;
            break;
        }
        if (Array.isArray(c.mentionedJid)) {
            // A @g.us JID in mentionedJid = group mention
            if (c.mentionedJid.some(j => j && j.endsWith('@g.us'))) {
                mentionsGroup = true;
                break;
            }
        }
    }

    // Also detect text-based patterns like @all / @everyone
    if (!mentionsGroup) {
        const rawText = (
            msg.conversation ||
            msg.extendedTextMessage?.text ||
            msg.imageMessage?.caption ||
            msg.videoMessage?.caption ||
            ''
        ).toLowerCase();
        if (rawText.includes('@everyone') || rawText.includes('@all') || rawText.includes('@tout')) {
            mentionsGroup = true;
        }
    }

    if (!mentionsGroup) return false;

    try {
        await sock.sendMessage(chatId, { delete: message.key });

        const senderNum = (senderId || '').split('@')[0];
        await sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔⌟\n` +
                `┃⌬╭━━━━━━━━━━━━━≽\n` +
                `┃⌬┃ @${senderNum}\n` +
                `╰━━━━━━━━━━━━❍\n` +
                `    🚫 𝗔𝗡𝗧𝗜𝗠𝗘𝗡𝗧𝗜𝗢𝗡𝗚𝗖\n` +
                `┃⌬┃ ❌ It is forbidden to\n` +
                `┃⌬┃ mention the group!\n` +
                `┃⌬┃ Your message has been deleted.\n` +
                `╰━━━━━━━━━━━━❍\n` +
                `\n> ©2026 ʋαɾɳσx xᴅ ʋ2 ᴅҽʋҽʅσρҽԃ Ⴆყ ʋαɾɳσx ᴛᴇᴄʜ`,
            mentions: [senderId],
            ...channelInfo
        });
    } catch (err) {
        console.error('[antimentiongc] error:', err.message);
    }
    return true;
}

module.exports = { antiMentionGcCommand, handleAntiMentionGc, isAntiMentionGcEnabled };
