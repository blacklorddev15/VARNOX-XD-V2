'use strict';

const { addWelcome, delWelcome, isWelcomeOn, addGoodbye, delGoodBye, isGoodByeOn } = require('../lib/index');

const DEFAULT_WELCOME = 'Welcome {user} to *{group}* ! 🎉';
const DEFAULT_GOODBYE = 'Goodbye {user} 👋';

function actionFrom(match) {
    return String(match || '').trim().split(/\s+/)[0].toLowerCase();
}

function welcomeHelp() {
    return '📥 *Welcome Configuration*\n\n' +
        '✅ *.welcome on* — Enable welcome messages\n' +
        '🚫 *.welcome off* — Disable welcome messages';
}

function goodbyeHelp() {
    return '📤 *Goodbye Configuration*\n\n' +
        '✅ *.goodbye on* — Enable goodbye messages\n' +
        '🚫 *.goodbye off* — Disable goodbye messages';
}

async function handleWelcome(sock, chatId, message, match) {
    const action = actionFrom(match);
    if (!action) {
        return sock.sendMessage(chatId, { text: welcomeHelp() }, { quoted: message });
    }

    if (action === 'on') {
        if (await isWelcomeOn(chatId)) {
            return sock.sendMessage(chatId, {
                text: '⚠️ Welcome messages are *already enabled*.'
            }, { quoted: message });
        }
        await addWelcome(chatId, true, DEFAULT_WELCOME);
        return sock.sendMessage(chatId, {
            text: '✅ Welcome messages *enabled* with the VARNOX format.'
        }, { quoted: message });
    }

    if (action === 'off') {
        if (!(await isWelcomeOn(chatId))) {
            return sock.sendMessage(chatId, {
                text: '⚠️ Welcome messages are *already disabled*.'
            }, { quoted: message });
        }
        await delWelcome(chatId);
        return sock.sendMessage(chatId, {
            text: '✅ Welcome messages *disabled* for this group.'
        }, { quoted: message });
    }

    return sock.sendMessage(chatId, {
        text: '❌ Invalid option. Use *.welcome on* or *.welcome off*.'
    }, { quoted: message });
}

async function handleGoodbye(sock, chatId, message, match) {
    const action = actionFrom(match);
    if (!action) {
        return sock.sendMessage(chatId, { text: goodbyeHelp() }, { quoted: message });
    }

    if (action === 'on') {
        if (await isGoodByeOn(chatId)) {
            return sock.sendMessage(chatId, {
                text: '⚠️ Goodbye messages are *already enabled*.'
            }, { quoted: message });
        }
        await addGoodbye(chatId, true, DEFAULT_GOODBYE);
        return sock.sendMessage(chatId, {
            text: '✅ Goodbye messages *enabled* with the VARNOX format.'
        }, { quoted: message });
    }

    if (action === 'off') {
        if (!(await isGoodByeOn(chatId))) {
            return sock.sendMessage(chatId, {
                text: '⚠️ Goodbye messages are *already disabled*.'
            }, { quoted: message });
        }
        await delGoodBye(chatId);
        return sock.sendMessage(chatId, {
            text: '✅ Goodbye messages *disabled* for this group.'
        }, { quoted: message });
    }

    return sock.sendMessage(chatId, {
        text: '❌ Invalid option. Use *.goodbye on* or *.goodbye off*.'
    }, { quoted: message });
}

module.exports = { handleWelcome, handleGoodbye };
