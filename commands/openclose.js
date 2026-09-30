'use strict';

const { channelInfo } = require('../lib/messageConfig');

async function openGroupCommand(sock, chatId, message) {
    if (!chatId.endsWith('@g.us')) {
        return sock.sendMessage(chatId, {
            text: '❌ This command only works in groups.',
            ...channelInfo
        }, { quoted: message });
    }

    try {
        await sock.groupSettingUpdate(chatId, 'not_announcement');
        const meta = await sock.groupMetadata(chatId);
        await sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗚𝗥𝗢𝗨𝗣 𝗢𝗣𝗘𝗡⌟\n` +
                `┃⌬┃ 🔓 *${meta.subject || 'Group'}*\n` +
                `┃⌬┃\n` +
                `┃⌬┃ ✅ The group is now *open*.\n` +
                `┃⌬┃ All members can write. 💬\n` +
                `╰━━━━━━━━━━━━━━━━❍\n` +
                `\n> ©2026 ʋαɾɳσx xᴅ ʋ2`,
            ...channelInfo
        }, { quoted: message });
    } catch (err) {
        console.error('[open] error:', err.message);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to open the group.',
            ...channelInfo
        }, { quoted: message });
    }
}

async function closeGroupCommand(sock, chatId, message) {
    if (!chatId.endsWith('@g.us')) {
        return sock.sendMessage(chatId, {
            text: '❌ This command only works in groups.',
            ...channelInfo
        }, { quoted: message });
    }

    try {
        await sock.groupSettingUpdate(chatId, 'announcement');
        const meta = await sock.groupMetadata(chatId);
        await sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗚𝗥𝗢𝗨𝗣 𝗖𝗟𝗢𝗦𝗘𝗗⌟\n` +
                `┃⌬┃ 🔒 *${meta.subject || 'Group'}*\n` +
                `┃⌬┃\n` +
                `┃⌬┃ ✅ The group is now *closed*.\n` +
                `┃⌬┃ Only admins can write. 🔐\n` +
                `╰━━━━━━━━━━━━━━━━❍\n` +
                `\n> ©2026 ʋαɾɳσx xᴅ ʋ2`,
            ...channelInfo
        }, { quoted: message });
    } catch (err) {
        console.error('[close] error:', err.message);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to close the group.',
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = { openGroupCommand, closeGroupCommand };
