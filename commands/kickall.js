'use strict';

const isOwnerOrSudo = require('../lib/isOwner');
const { channelInfo } = require('../lib/messageConfig');

/**
 * .kickall
 * Kicks all non-admin members of the group in one go.
 */
async function kickAllCommand(sock, chatId, senderId, message) {
    if (!chatId.endsWith('@g.us')) {
        return sock.sendMessage(chatId, {
            text: '❌ This command only works in groups.',
            ...channelInfo
        }, { quoted: message });
    }

    try {
        const meta    = await sock.groupMetadata(chatId);
        const botRaw  = (sock.user?.id || '').split(':')[0].split('@')[0];

        // Build the list of members to kick (non-admin, non-bot)
        const toKick = meta.participants.filter(p => {
            const pNum    = (p.id  || '').split(':')[0].split('@')[0];
            const pLidNum = (p.lid || '').split(':')[0].split('@')[0];
            const isAdm   = p.admin === 'admin' || p.admin === 'superadmin';
            const isBot   = pNum === botRaw || pLidNum === botRaw;
            return !isAdm && !isBot;
        });

        if (toKick.length === 0) {
            return sock.sendMessage(chatId, {
                text:
                    `╭━━━━⌜𝗞𝗜𝗖𝗞𝗔𝗟𝗟⌟\n` +
                    `┃⌬┃ ℹ️ No members to kick.\n` +
                    `┃⌬┃ All members are admins.\n` +
                    `╰━━━━━━━━━━━━━━━━❍`,
                ...channelInfo
            }, { quoted: message });
        }

        // Launch announcement
        await sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗞𝗜𝗖𝗞𝗔𝗟𝗟⌟\n` +
                `┃⌬┃ 🚫 *Mass kick…*\n` +
                `┃⌬┃\n` +
                `┃⌬┃ 👥 *${toKick.length}* member(s) targeted.\n` +
                `┃⌬┃ Please wait... ⏳\n` +
                `╰━━━━━━━━━━━━━━━━❍`,
            ...channelInfo
        }, { quoted: message });

        let kicked = 0;
        let failed = 0;

        for (const p of toKick) {
            try {
                await sock.groupParticipantsUpdate(chatId, [p.id], 'remove');
                kicked++;
                await new Promise(r => setTimeout(r, 600));
            } catch {
                failed++;
            }
        }

        await sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗞𝗜𝗖𝗞𝗔𝗟𝗟⌟\n` +
                `┃⌬┃ ✅ *Kick completed!*\n` +
                `┃⌬┃\n` +
                `┃⌬┃ 🚫 Kicked     : *${kicked}*\n` +
                `┃⌬┃ ❌ Failed     : *${failed}*\n` +
                `╰━━━━━━━━━━━━━━━━❍\n` +
                `\n> ©2026 ʋαɾɳσx xᴅ ʋ2`,
            ...channelInfo
        });

    } catch (err) {
        console.error('[kickall] error:', err.message);
        await sock.sendMessage(chatId, {
            text: '❌ Error during the mass kick.',
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = { kickAllCommand };
