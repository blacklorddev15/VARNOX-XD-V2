'use strict';
const settings = require('../settings');
const { getAllInstances } = require('../lib/botInstance');
function numberOf(value) { return String(value || '').split('@')[0].split(':')[0].replace(/\D/g, ''); }
async function statsCommand(sock, chatId, message) {
    const owner = numberOf(settings.ownerNumber);
    const candidates = [message.key.participant, message.key.participantAlt, message.key.remoteJid].filter(Boolean).map(numberOf);
    const botNumber = numberOf(sock.user?.id);
    if (!candidates.includes(owner) && !(message.key.fromMe && botNumber === owner)) {
        await sock.sendMessage(chatId, { text: 'Only the configured owner number can use this command.' }, { quoted: message });
        return;
    }
    const instances = getAllInstances();
    const connected = instances.filter(instance => instance.connected);
    const lines = ['📊 *VARNOX — SESSION STATS*', '', '• Connected sessions: *' + connected.length + '*', '• Detected sessions: *' + instances.length + '*', ''];
    for (const instance of instances) lines.push((instance.connected ? '✅ ' : '⚪ ') + instance.number + (instance.connected ? ' — online' : ' — offline'));
    await sock.sendMessage(chatId, { text: lines.join('\n') }, { quoted: message });
}
module.exports = statsCommand;
