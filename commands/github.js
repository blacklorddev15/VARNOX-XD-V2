'use strict';

const moment = require('moment-timezone');
const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');

const NEWSLETTER_JID  = '120363424782348922@newsletter';
const NEWSLETTER_NAME = '𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔';

const newsletterForward = {
    contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
            newsletterJid: NEWSLETTER_JID,
            newsletterName: NEWSLETTER_NAME,
            serverMessageId: -1
        }
    }
};

async function githubCommand(sock, chatId, message) {
    try {
        const res = await axios.get('https://api.github.com/repos/mohamedsoumahv99-bot/VARNOX-XD-V2', {
            headers: { 'User-Agent': 'VARNOX-XD-V2-Bot' },
            timeout: 8000
        });
        const json = res.data;

        const txt =
            `╭━━━━━━⌜ 𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔 ⌟━━━━━━╮\n` +
            `┃\n` +
            `┃  📦 *${json.name}*\n` +
            `┃  ─────────────────────────────\n` +
            `┃  👁️  Watchers  : *${json.watchers_count}*\n` +
            `┃  ⭐ Stars      : *${json.stargazers_count}*\n` +
            `┃  🔀 Forks      : *${json.forks_count}*\n` +
            `┃  💾 Size       : *${(json.size / 1024).toFixed(2)} MB*\n` +
            `┃  🕐 Updated    : *${moment(json.updated_at).format('DD/MM/YY HH:mm')}*\n` +
            `┃\n` +
            `┃  🔗 ${json.html_url}\n` +
            `┃\n` +
            `┃  💥 *Star the repo to support!*\n` +
            `┃\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━━━━━━━╯\n\n` +
            `> ©2026 ᴠᴀʀɴᴏx xᴅ ᴠ2 ᴅᴇᴠ ʙʏ ᴠᴀʀɴᴏx ᴛᴇᴄʜ`;

        const imgPath  = path.join(__dirname, '../assets/bot_image.jpg');
        const imgBuffer = fs.readFileSync(imgPath);

        await sock.sendMessage(chatId, {
            image:   imgBuffer,
            caption: txt,
            ...newsletterForward
        }, { quoted: message });

    } catch (error) {
        console.error('[github] Error:', error.message);
        await sock.sendMessage(chatId, {
            text: '❌ Failed to fetch GitHub info.',
            ...newsletterForward
        }, { quoted: message });
    }
}

module.exports = githubCommand;
