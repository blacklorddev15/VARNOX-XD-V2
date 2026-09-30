'use strict';

const isOwnerOrSudo = require('../lib/isOwner');
const { channelInfo } = require('../lib/messageConfig');

/**
 * .deleteall
 * Deletes all recent group messages (accessible by the bot).
 */
async function deleteAllCommand(sock, chatId, senderId, message) {
    // Use the current instance store (defined by botInstance.js)
    const store = sock.store || { messages: {} };
    // Group only
    if (!chatId.endsWith('@g.us')) {
        return sock.sendMessage(chatId, {
            text: '❌ This command only works in groups.',
            ...channelInfo
        }, { quoted: message });
    }

    // Confirmation and launch
    await sock.sendMessage(chatId, {
        text:
            `╭━━━━⌜𝗗𝗘𝗟𝗘𝗧𝗘𝗔𝗟𝗟⌟\n` +
            `┃⌬┃ 🗑️ *Deletion in progress...*\n` +
            `┃⌬┃ Deleting all recent\n` +
            `┃⌬┃ group messages. Please wait...\n` +
            `╰━━━━━━━━━━━━━━━━❍`,
        ...channelInfo
    }, { quoted: message });

    let deletedCount = 0;
    let failedCount = 0;

    try {
        const chatMessages = store.messages?.[chatId] || [];

        if (chatMessages.length === 0) {
            return sock.sendMessage(chatId, {
                text:
                    `╭━━━━⌜𝗗𝗘𝗟𝗘𝗧𝗘𝗔𝗟𝗟⌟\n` +
                    `┃⌬┃ ℹ️ No messages in cache.\n` +
                    `┃⌬┃ The bot can only delete the\n` +
                    `┃⌬┃ messages it has seen since its\n` +
                    `┃⌬┃ last startup.\n` +
                    `╰━━━━━━━━━━━━━━━━❍`,
                ...channelInfo
            }, { quoted: message });
        }

        // Delete each message
        for (const msg of chatMessages) {
            try {
                if (!msg || !msg.key) continue;
                await sock.sendMessage(chatId, { delete: msg.key });
                deletedCount++;
                await new Promise(r => setTimeout(r, 300));
            } catch {
                failedCount++;
            }
        }

        // Clear the store for this group
        if (store.messages) {
            store.messages[chatId] = [];
        }

        await sock.sendMessage(chatId, {
            text:
                `╭━━━━⌜𝗗𝗘𝗟𝗘𝗧𝗘𝗔𝗟𝗟⌟\n` +
                `┃⌬┃ ✅ *Cleanup complete*\n` +
                `┃⌬┃\n` +
                `┃⌬┃ 🗑️ Messages deleted : *${deletedCount}*\n` +
                `┃⌬┃ ❌ Failures : *${failedCount}*\n` +
                `╰━━━━━━━━━━━━━━━━❍\n` +
                `\n> ©2026 ʋαɾɳσx xᴅ ʋ2`,
            ...channelInfo
        });

    } catch (err) {
        console.error('[deleteall] error:', err.message);
        await sock.sendMessage(chatId, {
            text: '❌ Error while deleting messages.',
            ...channelInfo
        }, { quoted: message });
    }
}

module.exports = { deleteAllCommand };
