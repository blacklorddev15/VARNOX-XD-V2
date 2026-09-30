'use strict';
const { downloadContentFromMessage, jidNormalizedUser } = require('@whiskeysockets/baileys');
const { channelInfo } = require('../lib/messageConfig');

/**
 * vvCommand — opens a view-once media
 * @param {boolean} sendToPv
 *   false (default) → replies in the current chat (.vv)
 *   true            → sends to the PV of the account that connected the bot (.vv2)
 */
async function vvCommand(sock, chatId, message, sendToPv = false) {
    // Find the quoted message (view-once or normal)
    const ctx    = message.message?.extendedTextMessage?.contextInfo;
    const quoted = ctx?.quotedMessage;
    const senderJid = message.key.participant || message.key.remoteJid;
    const quotedSenderJid = ctx?.participant || ctx?.remoteJid || senderJid;
    // vv2 always opens in the private chat of the WhatsApp account that
    // connected the bot, even when the command was run from a group.
    const connectedAccountJid = sock.user?.id ? jidNormalizedUser(sock.user.id) : null;
    const targetJid = sendToPv ? (connectedAccountJid || senderJid) : chatId;

    const quotedImage =
        quoted?.imageMessage ||
        quoted?.viewOnceMessage?.message?.imageMessage ||
        quoted?.viewOnceMessageV2?.message?.imageMessage ||
        quoted?.viewOnceMessageV2Extension?.message?.imageMessage;

    const quotedVideo =
        quoted?.videoMessage ||
        quoted?.viewOnceMessage?.message?.videoMessage ||
        quoted?.viewOnceMessageV2?.message?.videoMessage ||
        quoted?.viewOnceMessageV2Extension?.message?.videoMessage;

    if (!quotedImage && !quotedVideo) {
        await sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔⌟\n` +
                `┃⌬╭━━━━━━━━━━━━━≽\n` +
                `┃⌬┃ ❌ Reply to a view-once\n` +
                `┃⌬┃ media (image/video).\n` +
                `╰━━━━━━━━━━━━❍\n` +
                `\n> ©2026 ʋαɾɳσx xᴅ ʋ2 ᴅҽʋҽʅσρҽԃ Ⴆყ ʋαɾɳσx ᴛᴇᴄʜ`,
            ...channelInfo
        }, { quoted: message });
        return;
    }

    try {
        const senderNum = (quotedSenderJid || senderJid || '').split('@')[0];
        const location  = chatId.endsWith('@g.us') ? chatId : 'Private';

        const caption =
            `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔⌟\n` +
            `┃⌬╭━━━━━━━━━━━━━≽\n` +
            `┃⌬┃ 📩 *View-once received*\n` +
            `╰━━━━━━━━━━━━❍\n` +
            `┃⌬┃ 👤 From: @${senderNum}\n` +
            `┃⌬┃ 💬 Group: ${location}\n` +
            `╰━━━━━━━━━━━━❍\n` +
            `\n> ©2026 ʋαɾɳσx xᴅ ʋ2 ᴅҽʋҽʅσρҽԃ Ⴆყ ʋαɾɳσx ᴛᴇᴄʜ`;

        if (quotedImage) {
            const stream = await downloadContentFromMessage(quotedImage, 'image');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            await sock.sendMessage(targetJid, { image: buffer, caption, ...channelInfo });
        } else {
            const stream = await downloadContentFromMessage(quotedVideo, 'video');
            let buffer = Buffer.from([]);
            for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
            await sock.sendMessage(targetJid, { video: buffer, caption, ...channelInfo });
        }

        // Confirm in the source chat if vv2
        if (sendToPv && targetJid !== chatId) {
            await sock.sendMessage(chatId, {
                text:
                    `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔⌟\n` +
                    `┃⌬┃ ✅ Media sent to PV!\n` +
                    `┃⌬┃ Check your private messages.\n` +
                    `╰━━━━━━━━━━━━❍`,
                ...channelInfo
            }, { quoted: message });
        }

    } catch (error) {
        console.error('[vv/vv2] error:', error.message);
        await sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔⌟\n` +
                `┃⌬┃ ❌ Unable to retrieve\n` +
                `┃⌬┃ the media.\n` +
                `╰━━━━━━━━━━━━❍`,
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = vvCommand;
