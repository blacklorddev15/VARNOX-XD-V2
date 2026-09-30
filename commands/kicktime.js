'use strict';

const isAdmin = require('../lib/isAdmin');
const isOwnerOrSudo = require('../lib/isOwner');
const { channelInfo } = require('../lib/messageConfig');

/**
 * .kicktime @user <minutes>
 * Kicks a user for X minutes then automatically re-adds them.
 * Reserved for premium users (sudo/owner).
 */
async function kickTimeCommand(sock, chatId, senderId, message) {
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
                `╭━━━━⌜𝗞𝗜𝗖𝗞𝗧𝗜𝗠𝗘⌟\n` +
                `┃⌬┃ 📌 Usage: *.kicktime @user <minutes>*\n` +
                `┃⌬┃ Ex: .kicktime @user 10\n` +
                `╰━━━━━━━━━━━━━━━━❍`,
            ...channelInfo
        }, { quoted: message });
    }

    if (isNaN(durationMin) || durationMin <= 0) {
        return sock.sendMessage(chatId, {
            text: '⚠️ Provide a valid duration in minutes. Ex: `.kicktime @user 10`',
            ...channelInfo
        }, { quoted: message });
    }

    const targetNum = mentionedJid.split('@')[0];
    const durationMs = durationMin * 60 * 1000;

    try {
        // Fetch the group invite link BEFORE kicking
        let inviteLink = null;
        try {
            const code = await sock.groupInviteCode(chatId);
            inviteLink = `https://chat.whatsapp.com/${code}`;
        } catch (e) {
            console.error('[kicktime] Could not get invite link:', e.message);
        }

        // Kick
        await sock.groupParticipantsUpdate(chatId, [mentionedJid], 'remove');

        // Notify in the group
        await sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗞𝗜𝗖𝗞𝗧𝗜𝗠𝗘⌟\n` +
                `┃⌬┃ 🚫 *Temporary kick*\n` +
                `┃⌬┃\n` +
                `┃⌬┃ 👤 @${targetNum}\n` +
                `┃⌬┃ ⏱️ Duration: *${durationMin} minute(s)*\n` +
                `┃⌬┃\n` +
                `┃⌬┃ ✅ User kicked.\n` +
                `┃⌬┃ ⏳ Automatic re-add in\n` +
                `┃⌬┃    *${durationMin} min*.\n` +
                `╰━━━━━━━━━━━━━━━━❍\n` +
                `\n> ©2026 ʋαɾɳσx xᴅ ʋ2`,
            mentions: [mentionedJid],
            ...channelInfo
        }, { quoted: message });

        // Private message to the kicked user
        if (inviteLink) {
            try {
                await sock.sendMessage(mentionedJid, {
                    text:
                        `╭━━━━⌜𝗞𝗜𝗖𝗞𝗧𝗜𝗠𝗘⌟\n` +
                        `┃⌬┃ 🚫 You have been temporarily kicked.\n` +
                        `┃⌬┃ ⏳ Wait *${durationMin} min*, you will be re-added.\n` +
                        `┃⌬┃\n` +
                        `┃⌬┃ 🔗 Rejoin link:\n` +
                        `┃⌬┃ ${inviteLink}\n` +
                        `╰━━━━━━━━━━━━━━━━❍`,
                    ...channelInfo
                });
            } catch {}
        }

        // Automatically re-add after the duration
        setTimeout(async () => {
            try {
                await sock.groupParticipantsUpdate(chatId, [mentionedJid], 'add');
                await sock.sendMessage(chatId, {
                    text:
                        `╭━━━━⌜𝗞𝗜𝗖𝗞𝗧𝗜𝗠𝗘⌟\n` +
                        `┃⌬┃ ✅ *Automatic re-add*\n` +
                        `┃⌬┃\n` +
                        `┃⌬┃ 👤 @${targetNum}\n` +
                        `┃⌬┃ has been re-added to the group.\n` +
                        `╰━━━━━━━━━━━━━━━━❍`,
                    mentions: [mentionedJid],
                    ...channelInfo
                });
            } catch (e) {
                console.error('[kicktime] auto-readd error:', e.message);
                // If re-adding fails, send the invite link
                if (inviteLink) {
                    try {
                        await sock.sendMessage(mentionedJid, {
                            text:
                                `✅ Your kick period is over.\n` +
                                `Rejoin the group here:\n${inviteLink}`,
                            ...channelInfo
                        });
                    } catch {}
                }
            }
        }, durationMs);

    } catch (err) {
        console.error('[kicktime] error:', err.message);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to kick this user.',
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = { kickTimeCommand };
