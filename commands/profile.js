'use strict';

const { channelInfo } = require('../lib/messageConfig');

function getTargetJid(message) {
    const context = message?.message?.extendedTextMessage?.contextInfo;
    const mentioned = context?.mentionedJid?.[0];
    return mentioned || context?.participant || message?.key?.participant || message?.key?.remoteJid;
}

function displayNumber(jid) {
    return String(jid || '').split(':')[0].split('@')[0];
}

async function profileCommand(sock, chatId, message) {
    const target = getTargetJid(message);
    if (!target) {
        await sock.sendMessage(chatId, {
            text: '❌ Unable to determine the requested profile.',
            ...channelInfo
        }, { quoted: message });
        return;
    }

    let name = `+${displayNumber(target)}`;
    try {
        if (typeof sock.getName === 'function') {
            name = String(await sock.getName(target) || name);
        }
    } catch {}

    const text =
        `╭──⟪𝗩𝗔𝗥𝗡𝗢𝗫 𝗣𝗥𝗢𝗙𝗜𝗟𝗘⟫──╮\n` +
        `┃⌬┃ 👤 Name: ${name}\n` +
        `┃⌬┃ 🆔 Mention: @${displayNumber(target)}\n` +
        `┃⌬┃ 📍 Type: ${target.endsWith('@g.us') ? 'Group' : 'Member'}\n` +
        `╰━━━━━━━━━━━━❍`;

    let profilePicture;
    try {
        profilePicture = await sock.profilePictureUrl(target, 'image');
    } catch {}

    const content = profilePicture
        ? { image: { url: profilePicture }, caption: text, mentions: [target], ...channelInfo }
        : { text, mentions: [target], ...channelInfo };

    await sock.sendMessage(chatId, content, { quoted: message });
}

module.exports = profileCommand;