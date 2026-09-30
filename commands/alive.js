const settings = require('../settings');

async function aliveCommand(sock, chatId, message) {
    const sender = message.key.participant || message.key.remoteJid;
    const senderNumber = sender ? sender.split('@')[0] : 'User';
    try {
        const aliveMsg = `
╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔⌟
┃⌬╭━━━━━━━━━━━━━━━≽
┃⌬┃ @${senderNumber}
┃⌬┃✅️*sᴛᴀᴛᴜs*  :  Online 🟢
┃⌬┃♻️*ᴠᴇʀsɪᴏɴ* :  v${String(settings.version).padEnd(6)}
┃⌬┃🌍 *ᴍᴏᴅᴇ*   :  Public 
┃⌬┃👑 *ᴏᴡɴᴇʀ*  :  ʋαɾɳσx ❍
╰━━━━━━━━━━━━❍

> ©2026 ʋαɾɳσx xԃ ʋ2 ᴅҽʋҽʅσρҽԃ Ⴆყ ʋαɾɳσx ❍ϝϝιƈιαʟ ᴛҽƈԋ`.trim();

        await sock.sendMessage(chatId, {
            image: { url: 'https://files.catbox.moe/jieuny.jpg' },
            caption: aliveMsg,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363424782348922@newsletter',
                    newsletterName: '𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔',
                    serverMessageId: -1
                }
            }
        }, { quoted: message });
    } catch (error) {
        console.error('Error in alive command:', error);
        await sock.sendMessage(chatId, { text: '🤖 𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔 is online!' }, { quoted: message });
    }
}

module.exports = aliveCommand;
