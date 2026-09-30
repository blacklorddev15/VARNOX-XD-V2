'use strict';

const { bots }                                      = require('../lib/antilink');
const { setAntilink, getAntilink, removeAntilink }  = require('../lib/index');
const isAdmin                                       = require('../lib/isAdmin');
const { channelInfo }                               = require('../lib/messageConfig');

// ─── Command .antilink ───────────────────────────────────────────────────────
async function handleAntilinkCommand(sock, chatId, userMessage, senderId, isSenderAdmin, message) {
    try {
        if (!isSenderAdmin) {
            await sock.sendMessage(chatId, {
                text: '❌ This command is restricted to group admins.'
            }, { quoted: message });
            return;
        }

        const prefix = '.';
        const args   = userMessage.slice(9).toLowerCase().trim().split(' ');
        const action = args[0];

        if (!action) {
            const usage =
                `╭──⟪𝗩𝗔𝗥𝗡𝗢𝗫 𝗔𝗡𝗧𝗜𝗟𝗜𝗡𝗞⟫──╮\n` +
                `┃⌬┃ Status : check with .antilink get\n` +
                `┃⌬┃ .antilink on\n` +
                `┃⌬┃ .antilink set delete | kick | warn\n` +
                `┃⌬┃ .antilink off\n` +
                `╰━━━━━━━━━━━━❍`;
            await sock.sendMessage(chatId, { text: usage, ...channelInfo }, { quoted: message });
            return;
        }

        switch (action) {
            case 'on': {
                const existingConfig = await getAntilink(chatId, 'on');
                // FIX: the DB stores `.enabled`, not `.activé`
                if (existingConfig?.enabled) {
                    await sock.sendMessage(chatId, { text: '⚠️ VARNOX antilink is already enabled.', ...channelInfo }, { quoted: message });
                    return;
                }
                const result = await setAntilink(chatId, 'on', 'delete');
                await sock.sendMessage(chatId, {
                    text: result ? '╭──⟪𝗩𝗔𝗥𝗡𝗢𝗫 𝗔𝗡𝗧𝗜𝗟𝗜𝗡𝗞⟫──╮\n┃⌬┃ ✅ Protection enabled.\n┃⌬┃ Current action : delete.\n╰━━━━━━━━━━━━❍' : '❌ Unable to enable antilink.',
                    ...channelInfo
                }, { quoted: message });
                break;
            }

            case 'off':
                await removeAntilink(chatId, 'on');
                await sock.sendMessage(chatId, { text: '╭──⟪𝗩𝗔𝗥𝗡𝗢𝗫 𝗔𝗡𝗧𝗜𝗟𝗜𝗡𝗞⟫──╮\n┃⌬┃ 🔕 Protection disabled.\n╰━━━━━━━━━━━━❍', ...channelInfo }, { quoted: message });
                break;

            case 'set': {
                if (args.length < 2) {
                    await sock.sendMessage(chatId, {
                        text: `❌ Choose an action : ${prefix}antilink set delete | kick | warn`,
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
                const setAction = args[1];
                if (!['delete', 'kick', 'warn'].includes(setAction)) {
                    await sock.sendMessage(chatId, {
                        text: '❌ Invalid action. Choose delete, kick or warn.',
                        ...channelInfo
                    }, { quoted: message });
                    return;
                }
                const setResult = await setAntilink(chatId, 'on', setAction);
                await sock.sendMessage(chatId, {
                    text: setResult ? `✅ VARNOX antilink set to : ${setAction}.` : '❌ Unable to change the antilink action.',
                    ...channelInfo
                }, { quoted: message });
                break;
            }

            case 'get': {
                const status = await getAntilink(chatId, 'on');
                await sock.sendMessage(chatId, {
                    text:
                        `╭──⟪𝗩𝗔𝗥𝗡𝗢𝗫 𝗔𝗡𝗧𝗜𝗟𝗜𝗡𝗞⟫──╮\n` +
                        `┃⌬┃ Status : ${status?.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                        `┃⌬┃ Action : ${status?.action || 'delete'}\n` +
                        `╰━━━━━━━━━━━━❍`,
                    ...channelInfo
                }, { quoted: message });
                break;
            }

            default:
                await sock.sendMessage(chatId, {
                    text: `❌ Invalid option. Use ${prefix}antilink for help.`,
                    ...channelInfo
                }, { quoted: message });
        }
    } catch (error) {
        console.error('[antilink] Command error:', error.message);
        await sock.sendMessage(chatId, { text: '❌ An error prevented VARNOX from processing antilink.', ...channelInfo }, { quoted: message });
    }
}

// ─── Link detection (legacy function, main detection is in lib/antilink.js) ──
async function handleLinkDetection(sock, chatId, message, userMessage, senderId) {
    // The real detection is handled by lib/antilink.js (Antilink) called in main.js
    // This function is kept for compatibility
}

module.exports = { handleAntilinkCommand, handleLinkDetection };
