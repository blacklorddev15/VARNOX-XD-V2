'use strict';
const fs = require('fs');
const { channelInfo } = require('../lib/messageConfig');

const DATA_FILE = './data/antipromote.json';

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

function isAntiPromoteEnabled(chatId) {
    return !!readState()[chatId];
}

async function antiPromoteCommand(sock, chatId, senderId, message, args) {
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
                `┃⌬┃ 🛡️ *ANTIPROMOTE*\n` +
                `╰━━━━━━━━━━━━❍\n` +
                `    📢𝗔𝗡𝗡𝗢𝗡𝗖𝗘 ❍𝗙𝗙𝗜𝗖𝗜𝗔𝗟\n` +
                `┃⌬┃ ✅ Enabled! Any member\n` +
                `┃⌬┃ promoted will be auto-demoted,\n` +
                `┃⌬┃ even by an admin!\n` +
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
                `┃⌬┃ 🛡️ *ANTIPROMOTE*\n` +
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
                `┃⌬┃ 🛡️ *ANTIPROMOTE*\n` +
                `╰━━━━━━━━━━━━❍\n` +
                `┃⌬┃ Status : *${enabled ? '✅ Enabled' : '❌ Disabled'}*\n` +
                `┃⌬┃\n` +
                `┃⌬┃ Usage :\n` +
                `┃⌬┃ .antipromote on  — enable\n` +
                `┃⌬┃ .antipromote off — disable\n` +
                `╰━━━━━━━━━━━━❍\n` +
                `\n> ©2026 ʋαɾɳσx xᴅ ʋ2 ᴅҽʋҽʅσρҽԃ Ⴆყ ʋαɾɳσx ᴛᴇᴄʜ`,
            ...channelInfo
        }, { quoted: message });
    }
}

/**
 * Called from handleGroupParticipantUpdate when action === 'promote'
 * Returns true if antipromote was active and demoted the member.
 */
async function handleAntiPromoteEvent(sock, groupId, participants) {
    if (!isAntiPromoteEnabled(groupId)) return false;
    try {
        await sock.groupParticipantsUpdate(groupId, participants, 'demote');
        const memberList = participants.map(p => `⌬  @${p.split('@')[0]}`).join('\n');
        await sock.sendMessage(groupId, {
            text:
                `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔⌟\n` +
                `┃⌬╭━━━━━━━━━━━━━≽\n` +
                `┃⌬┃ 🛡️ *ANTIPROMOTE ACTIVE*\n` +
                `╰━━━━━━━━━━━━❍\n` +
                `    🚫 𝗣𝗥𝗢𝗠𝗢𝗧𝗜𝗢𝗡 𝗥𝗘𝗙𝗨𝗦𝗘́𝗘\n` +
                `\n` +
                `${memberList}\n` +
                `\n` +
                `┃⌬┃ 🔔 This member was demoted\n` +
                `┃⌬┃  automatically!\n` +
                `╰━━━━━━━━━━━━❍\n` +
                `\n> ©2026 ʋαɾɳσx xᴅ ʋ2 ᴅҽʋҽʅσρҽԃ Ⴆყ ʋαɾɳσx ᴛᴇᴄʜ`,
            mentions: participants,
            ...channelInfo
        });
        return true;
    } catch (err) {
        console.error('[antipromote] error:', err.message);
        return false;
    }
}

module.exports = { antiPromoteCommand, handleAntiPromoteEvent, isAntiPromoteEnabled };
