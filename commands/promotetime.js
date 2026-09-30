'use strict';

const isAdmin = require('../lib/isAdmin');
const isOwnerOrSudo = require('../lib/isOwner');
const { channelInfo } = require('../lib/messageConfig');

/**
 * .promotetime @user <minutes>
 * Promotes a user to admin for X minutes then automatically demotes them.
 * Reserved for premium users (sudo/owner).
 */
async function promoteTimeCommand(sock, chatId, senderId, message) {
    // Group only
    if (!chatId.endsWith('@g.us')) {
        return sock.sendMessage(chatId, {
            text: '❌ This command only works in groups.',
            ...channelInfo
        }, { quoted: message });
    }

    // Reserved for premium / owner
    const isPremium = message.key.fromMe || await isOwnerOrSudo(senderId, sock, chatId);
    if (!isPremium) {
        return sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗣𝗥𝗘𝗠𝗜𝗨𝗠⌟\n` +
                `┃⌬┃ ⭐ This command is reserved\n` +
                `┃⌬┃    for *premium* users.\n` +
                `┃⌬┃ Contact the bot owner.\n` +
                `╰━━━━━━━━━━━━━━━━❍`,
            ...channelInfo
        }, { quoted: message });
    }

    // Extract target JID and duration
    const rawText = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    const parts = rawText.trim().split(/\s+/);
    const durationStr = parts[parts.length - 1];
    const durationMin = parseInt(durationStr, 10);

    const mentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0]
        || message.message?.extendedTextMessage?.contextInfo?.participant;

    if (!mentionedJid) {
        return sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗣𝗥𝗢𝗠𝗢𝗧𝗘𝗧𝗜𝗠𝗘⌟\n` +
                `┃⌬┃ 📌 Usage: *.promotetime @user <minutes>*\n` +
                `┃⌬┃ Ex: .promotetime @user 30\n` +
                `╰━━━━━━━━━━━━━━━━❍`,
            ...channelInfo
        }, { quoted: message });
    }

    if (isNaN(durationMin) || durationMin <= 0) {
        return sock.sendMessage(chatId, {
            text: '⚠️ Provide a valid duration in minutes. Ex: `.promotetime @user 30`',
            ...channelInfo
        }, { quoted: message });
    }

    const targetNum = mentionedJid.split('@')[0];
    const durationMs = durationMin * 60 * 1000;

    try {
        // Promote
        await sock.groupParticipantsUpdate(chatId, [mentionedJid], 'promote');

        await sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗣𝗥𝗢𝗠𝗢𝗧𝗘𝗧𝗜𝗠𝗘⌟\n` +
                `┃⌬┃ 👑 *Temporary promotion*\n` +
                `┃⌬┃\n` +
                `┃⌬┃ 👤 @${targetNum}\n` +
                `┃⌬┃ ⏱️ Duration: *${durationMin} minute(s)*\n` +
                `┃⌬┃\n` +
                `┃⌬┃ ✅ User promoted to admin.\n` +
                `┃⌬┃ ⏳ Automatic demotion in\n` +
                `┃⌬┃    *${durationMin} min*.\n` +
                `╰━━━━━━━━━━━━━━━━❍\n` +
                `\n> ©2026 ʋαɾɳσx xᴅ ʋ2`,
            mentions: [mentionedJid],
            ...channelInfo
        }, { quoted: message });

        // Automatically demote after the duration
        setTimeout(async () => {
            try {
                await sock.groupParticipantsUpdate(chatId, [mentionedJid], 'demote');
                await sock.sendMessage(chatId, {
                    text:
                        `╭━━━━⌜𝗣𝗥𝗢𝗠𝗢𝗧𝗘𝗧𝗜𝗠𝗘⌟\n` +
                        `┃⌬┃ ⏰ *Promotion expired*\n` +
                        `┃⌬┃\n` +
                        `┃⌬┃ 👤 @${targetNum}\n` +
                        `┃⌬┃ The ${durationMin} min promotion is over.\n` +
                        `┃⌬┃ The user has been demoted. ✅\n` +
                        `╰━━━━━━━━━━━━━━━━❍`,
                    mentions: [mentionedJid],
                    ...channelInfo
                });
            } catch (e) {
                console.error('[promotetime] auto-demote error:', e.message);
            }
        }, durationMs);

    } catch (err) {
        console.error('[promotetime] error:', err.message);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to promote this user.',
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = { promoteTimeCommand };
