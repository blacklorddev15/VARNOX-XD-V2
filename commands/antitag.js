'use strict';

const { setAntitag, getAntitag, removeAntitag } = require('../lib/index');
const isAdmin = require('../lib/isAdmin');
const { channelInfo } = require('../lib/messageConfig');

// ─── Command .antitag ────────────────────────────────────────────────────────
async function handleAntitagCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message) {
    try {
        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, { text: '```For Group Admins Only!```', ...channelInfo }, { quoted: message });
            return;
        }

        const prefix = '.';
        const args   = userMessage.slice(9).toLowerCase().trim().split(' ');
        const action = args[0];

        if (!action) {
            const usage =
                `\`\`\`ANTITAG SETUP\n\n` +
                `${prefix}antitag on\n` +
                `${prefix}antitag set delete | kick\n` +
                `${prefix}antitag off\`\`\``;
            await sock.sendMessage(chatId, { text: usage, ...channelInfo }, { quoted: message });
            return;
        }

        switch (action) {
            case 'on': {
                const existingConfig = await getAntitag(chatId, 'on');
                // FIX: the DB stores `.enabled`, not `.activé`
                if (existingConfig?.enabled) {
                    await sock.sendMessage(chatId, { text: '*_Antitag is already on_*', ...channelInfo }, { quoted: message });
                    return;
                }
                const result = await setAntitag(chatId, 'on', 'delete');
                await sock.sendMessage(chatId, {
                    text: result ? '*_Antitag has been turned ON_*' : '*_Failed to turn on Antitag_*',
                    ...channelInfo
                }, { quoted: message });
                break;
            }

            case 'off':
                await removeAntitag(chatId, 'on');
                await sock.sendMessage(chatId, { text: '*_Antitag has been turned OFF_*', ...channelInfo }, { quoted: message });
                break;

            case 'set': {
                if (args.length < 2) {
                    await sock.sendMessage(chatId, {
                        text: `*_Please specify an action: ${prefix}antitag set delete | kick_*`,
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
                const setAction = args[1];
                if (!['delete', 'kick'].includes(setAction)) {
                    await sock.sendMessage(chatId, {
                        text: '*_Invalid action. Choose delete or kick._*',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
                const setResult = await setAntitag(chatId, 'on', setAction);
                await sock.sendMessage(chatId, {
                    text: setResult ? `*_Antitag action set to ${setAction}_*` : '*_Failed to set Antitag action_*',
                    ...channelInfo
                }, { quoted: message });
                break;
            }

            case 'get': {
                const status = await getAntitag(chatId, 'on');
                await sock.sendMessage(chatId, {
                    text:
                        `*_Antitag Configuration:_*\n` +
                        `Status: ${status?.enabled ? 'ON ✅' : 'OFF ❌'}\n` +
                        `Action: ${status?.action || 'Not set'}`,
                    ...channelInfo
                }, { quoted: message });
                break;
            }

            default:
                await sock.sendMessage(chatId, {
                    text: `*_Use ${prefix}antitag for usage._*`,
                    ...channelInfo
                }, { quoted: message });
        }
    } catch (error) {
        console.error('[antitag] Command error:', error.message);
        await sock.sendMessage(chatId, { text: '*_Error processing antitag command_*', ...channelInfo }, { quoted: message });
    }
}

// ─── Automatic tagall detection in groups ────────────────────────
async function handleTagDetection(sock, chatId, message, senderId) {
    try {
        const antitagSetting = await getAntitag(chatId, 'on');

        // CRITICAL FIX: the DB stores `.enabled`, not `.activé`
        if (!antitagSetting || !antitagSetting.enabled) return;

        // Ignore messages from the bot itself
        if (message.key.fromMe) return;

        // Ignore admins
        try {
            const { isSenderAdmin } = await isAdmin(sock, chatId, senderId);
            if (isSenderAdmin) return;
        } catch { /* continue */ }

        // Official WhatsApp mentions
        const mentionedJids = message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];

        // Message text
        const messageText =
            message.message?.conversation ||
            message.message?.extendedTextMessage?.text ||
            message.message?.imageMessage?.caption ||
            message.message?.videoMessage?.caption ||
            '';

        // Numeric mentions in the text (bot tagall pattern)
        const numericMentions   = messageText.match(/@\d{8,}/g) || [];
        const uniqueNumericNums = new Set(numericMentions.map(m => m.replace('@', '')));

        const mentionedJidCount  = mentionedJids.length;
        const numericMentionCount = uniqueNumericNums.size;
        const totalMentions       = Math.max(mentionedJidCount, numericMentionCount);

        if (totalMentions < 3) return;

        // Threshold : more than 50% of members
        const groupMetadata   = await sock.groupMetadata(chatId);
        const participants    = groupMetadata.participants || [];
        const mentionThreshold = Math.ceil(participants.length * 0.5);

        const hasManyNumericMentions =
            numericMentionCount >= 10 ||
            (numericMentionCount >= 5 && numericMentionCount >= mentionThreshold);

        if (totalMentions < mentionThreshold && !hasManyNumericMentions) return;

        const action = antitagSetting.action || 'delete';

        // Delete the message
        try {
            await sock.sendMessage(chatId, {
                delete: {
                    remoteJid:   chatId,
                    fromMe:      false,
                    id:          message.key.id,
                    participant: senderId
                }
            });
        } catch { /* the message may already be gone */ }

        if (action === 'delete') {
            await sock.sendMessage(chatId, {
                text: `⚠️ *Tagall forbidden!* @${senderId.split('@')[0]} has been warned.`,
                mentions: [senderId],
                ...channelInfo
            });
        } else if (action === 'kick') {
            try {
                await sock.groupParticipantsUpdate(chatId, [senderId], 'remove');
                await sock.sendMessage(chatId, {
                    text: `🚫 *Antitag :* @${senderId.split('@')[0]} was kicked for tagging all members.`,
                    mentions: [senderId],
                    ...channelInfo
                });
            } catch (e) {
                console.error('[antitag] Kick error:', e.message);
            }
        }

    } catch (error) {
        console.error('[antitag] Detection error:', error.message);
    }
}

module.exports = { handleAntitagCommand, handleTagDetection };
