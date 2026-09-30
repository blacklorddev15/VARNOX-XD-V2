'use strict';

const { handleGoodbye } = require('../lib/welcome');
const { isGoodByeOn } = require('../lib/index');
const { channelInfo, participantJid, sendMemberEvent } = require('../lib/memberEvent');

function commandArgs(text, command) {
    return text.replace(new RegExp('^\\s*\\.' + command + '\\b', 'i'), '').trim();
}

async function goodbyeCommand(sock, chatId, message) {
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: 'This command only works in groups.' });
        return;
    }
    const text = message.message?.conversation || message.message?.extendedTextMessage?.text || '';
    await handleGoodbye(sock, chatId, message, commandArgs(text, 'goodbye'));
}

async function handleLeaveEvent(sock, id, participants) {
    if (!(await isGoodByeOn(id))) return;

    for (const participant of participants || []) {
        try {
            const jid = participantJid(participant);
            const senderNum = jid.split('@')[0];
            const goodbyeMsg = `👋 Goodbye @${senderNum}.`;

            await sendMemberEvent(sock, id, jid, goodbyeMsg);
        } catch (err) {
            console.error('[goodbye] Error:', err.message);
            try {
                const jid = participantJid(participant);
                const num = jid.split('@')[0];
                await sock.sendMessage(id, {
                    text: '👋 Goodbye @' + num + '! We\'ll miss you...',
                    mentions: [jid],
                    ...channelInfo()
                });
            } catch { /* nothing */ }
        }
    }
}

module.exports = { goodbyeCommand, handleLeaveEvent };
