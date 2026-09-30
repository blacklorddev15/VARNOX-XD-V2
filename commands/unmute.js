'use strict';

const muteCommand = require('./mute');

async function unmuteCommand(sock, chatId, senderId, message, mentionedJids = []) {
    try {
        const targets = muteCommand.getTargetJids(message, mentionedJids);
        if (targets.length > 0) {
            const removed = muteCommand.clearMuted(chatId, targets);
            const names = targets.map(jid => '@' + jid.split('@')[0]).join(', ');
            const verb = targets.length > 1 ? "aren't" : "isn't";
            const text = removed ? '🔊 ' + names + ' ' + verb + ' muted anymore.' : 'ℹ️ ' + names + ' ' + verb + ' in the muted users list.';
            await sock.sendMessage(chatId, {text, mentions: targets}, {quoted: message});
            return;
        }

        // Compatibility kept: with no target, .unmute reopens the whole group.
        await sock.groupSettingUpdate(chatId, 'not_announcement');
        await sock.sendMessage(chatId, {text: '🔊 The group is open again.'}, {quoted: message});
    } catch (error) {
        console.error('[unmute] error:', error);
        await sock.sendMessage(chatId, {text: '❌ Unable to apply unmute. Check that the bot is an administrator.'}, {quoted: message});
    }
}

module.exports = unmuteCommand;
