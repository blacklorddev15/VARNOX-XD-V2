'use strict';
const {channelInfo} = require('../lib/messageConfig');
async function kickAll2Command(sock, chatId, senderId, message) {
    if (!chatId.endsWith('@g.us')) return sock.sendMessage(chatId, Object.assign({text:'❌ This command only works in groups.'}, channelInfo), {quoted:message});
    try {
        const meta = await sock.groupMetadata(chatId);
        const botId = (sock.user?.id || '').split(':')[0].split('@')[0];
        const targets = meta.participants.filter(p => {
            const number = (p.id || '').split(':')[0].split('@')[0]; const lid = (p.lid || '').split(':')[0].split('@')[0];
            return p.admin !== 'admin' && p.admin !== 'superadmin' && number !== botId && lid !== botId;
        }).map(p => p.id);
        if (!targets.length) return sock.sendMessage(chatId, Object.assign({text:'ℹ️ No non-admin member to kick.'}, channelInfo), {quoted:message});
        await sock.sendMessage(chatId, Object.assign({text:'╭───⟪𝗞𝗜𝗖𝗞𝗔𝗟𝗟𝟮⟫───╮\n┃⌬┃ Kicking ' + targets.length + ' member(s) in a single operation…\n╰━━━━━━━━━━━━❍'}, channelInfo), {quoted:message});
        await sock.groupParticipantsUpdate(chatId, targets, 'remove');
        await sock.sendMessage(chatId, Object.assign({text:'✅ Kickall2 completed: ' + targets.length + ' member(s) processed.\n\n> 𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔'}, channelInfo));
    } catch (error) {
        console.error('[kickall2] error:', error.message);
        await sock.sendMessage(chatId, Object.assign({text:'❌ Kickall2 failed. Check admin rights and WhatsApp limits.'}, channelInfo), {quoted:message});
    }
}
module.exports = {kickAll2Command};
