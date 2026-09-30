const fs = require('fs');
const path = require('path');
const { channelInfo } = require('../lib/messageConfig');

const ANTIBOT_FILE = path.join(__dirname, '../data/antibot.json');

function readAntibotState() {
    try {
        if (!fs.existsSync(ANTIBOT_FILE)) return {};
        return JSON.parse(fs.readFileSync(ANTIBOT_FILE));
    } catch { return {}; }
}

function saveAntibotState(state) {
    fs.writeFileSync(ANTIBOT_FILE, JSON.stringify(state, null, 2));
}

function isAntibotEnabled(chatId) {
    const state = readAntibotState();
    return state[chatId] === true;
}

async function antibotCommand(sock, chatId, message, args, isSenderAdmin) {
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: '❌ This command only works in groups.', ...channelInfo }, { quoted: message });
        return;
    }

    if (!isSenderAdmin) {
        await sock.sendMessage(chatId, { text: '❌ Only admins can use this command.', ...channelInfo }, { quoted: message });
        return;
    }

    const state = readAntibotState();
    const action = args[0]?.toLowerCase();

    if (!action || action === 'statut') {
        const status = state[chatId] ? '✅ Enabled' : '❌ Disabled';
        await sock.sendMessage(chatId, {
            text: `🤖 *ANTIBOT*\n\n📊 Status : ${status}\n\n📌 Usage :\n• *.antibot on* → Enable\n• *.antibot off* → Disable\n\n💡 When enabled, no other bot will be able to reply in this group.`,
            ...channelInfo
        }, { quoted: message });
        return;
    }

    if (action === 'on') {
        if (state[chatId]) {
            await sock.sendMessage(chatId, { text: '⚠️ Antibot is already enabled in this group.', ...channelInfo }, { quoted: message });
            return;
        }
        state[chatId] = true;
        saveAntibotState(state);
        await sock.sendMessage(chatId, {
            text: '✅ *Antibot enabled!*\n\n🛡️ No other bot will be able to reply in this group.',
            ...channelInfo
        }, { quoted: message });
    } else if (action === 'off') {
        if (!state[chatId]) {
            await sock.sendMessage(chatId, { text: '⚠️ Antibot is already disabled in this group.', ...channelInfo }, { quoted: message });
            return;
        }
        state[chatId] = false;
        saveAntibotState(state);
        await sock.sendMessage(chatId, {
            text: '❌ *Antibot disabled!*\n\n🔓 Other bots can now reply in this group.',
            ...channelInfo
        }, { quoted: message });
    } else {
        await sock.sendMessage(chatId, { text: '❌ Invalid option. Use : .antibot on/off', ...channelInfo }, { quoted: message });
    }
}

module.exports = { antibotCommand, isAntibotEnabled };
