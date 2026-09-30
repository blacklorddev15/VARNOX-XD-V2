'use strict';

const channelInfo = {
    contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid:  '120363424782348922@newsletter',
            newsletterName: '𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔',
            serverMessageId: -1
        }
    }
};

async function tagAllCommand(sock, chatId, senderId, message) {
    try {
        if (!chatId.endsWith('@g.us')) {
            await sock.sendMessage(chatId, { text: '❌ This command only works in groups.' }, { quoted: message });
            return;
        }

        const groupMetadata = await sock.groupMetadata(chatId);
        const participants  = groupMetadata.participants;

        if (!participants || participants.length === 0) {
            await sock.sendMessage(chatId, { text: '❌ No participants found.' }, { quoted: message });
            return;
        }

        const groupName = groupMetadata.subject || 'Group';
        const count     = participants.length;
        const senderNum = senderId.split('@')[0];
        const mentions  = participants.map(p => p.id);

        const memberList = participants
            .map((p, i) => `⌬  ${i + 1}. @${p.id.split('@')[0]}`)
            .join('\n');

        const tagMessage =
            `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔⌟\n` +
            `┃⌬╭━━━━━━━━━━━━━≽\n` +
            `┃⌬┃ @${senderNum}\n` +
            `╰━━━━━━━━━━━━❍\n` +
            `    📢 𝗔𝗡𝗡𝗢𝗨𝗡𝗖𝗘𝗠𝗘𝗡𝗧 ❍𝗙𝗙𝗜𝗖𝗜𝗔𝗟\n` +
            `┃⌬┃ 🏷️ *${groupName}*\n` +
            `┃⌬┃ 👥 *Tagged members: ${count}*\n` +
            `\n` +
            `${memberList}\n` +
            `\n` +
            `┃⌬┃\n` +
            `┃⌬┃ 🔔 ᴀᴛᴛᴇɴᴛɪᴏɴ ᴛᴏ\n` +
            `┃⌬┃  ᴇᴠᴇʀʏᴏɴᴇ !\n` +
            `╰━━━━━━━━━━━━❍\n` +
            `\n` +
            `> ©2026 ʋαɾɳσx xᴅ ʋ2 ᴅҽʋҽʅσρҽԃ Ⴆყ ʋαɾɳσx ᴛᴇᴄʜ`;

        await sock.sendMessage(chatId, {
            text:     tagMessage,
            mentions: mentions,
            ...channelInfo
        }, { quoted: message });

    } catch (err) {
        console.error('[tagall] error:', err.message);
        await sock.sendMessage(chatId, { text: '❌ Unable to tag all members.' }, { quoted: message });
    }
}

module.exports = tagAllCommand;
