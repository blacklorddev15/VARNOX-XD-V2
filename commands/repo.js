'use strict';

const fs = require('fs');
const path = require('path');
const { channelInfo } = require('../lib/messageConfig');
const { sendInteractiveMessage } = require('../lib/interactiveButtons');

const WEBSITE_URL = 'https://varnox-xd-v2.onrender.com';
const IMAGE_PATH = path.join(__dirname, '../assets/bot_image.jpg');

function repoCaption() {
    return [
        '╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗫𝗗 𝗩2⌟',
        '┃⌬╭━━━━━━━━━━━━━≽',
        '┃⌬┃ 🤖 *VARNOX XD V2*',
        '╰━━━━━━━━━━━━❍',
        '',
        '✅ *Website disponible*',
        WEBSITE_URL,
        '',
        '> ©2026 ʋαɾɳσx xᴅ ʋ2 ᴅҽʋҽʅσρҽԃ Ⴆყ ʋαɾɳσx ᴛᴇᴄʜ'
    ].join('\n');
}

function repoButtons() {
    return [
        {
            name: 'cta_url',
            params: {
                display_text: '↗️ Ouvrir le site',
                url: WEBSITE_URL
            }
        },
        {
            name: 'cta_copy',
            params: {
                display_text: '📋 Copier le lien',
                copy_code: WEBSITE_URL
            }
        }
    ];
}

async function repoCommand(sock, chatId, message) {
    const image = fs.existsSync(IMAGE_PATH) ? fs.readFileSync(IMAGE_PATH) : null;
    const options = {
        body: repoCaption(),
        footer: '𝗩𝗔𝗥𝗡𝗢𝗫 𝗫𝗗 𝗩2',
        title: '𝗩𝗔𝗥𝗡𝗢𝗫 𝗫𝗗 𝗩2',
        contextInfo: channelInfo.contextInfo,
        buttons: repoButtons(),
        quoted: message
    };

    try {
        await sendInteractiveMessage(sock, chatId, { ...options, image });
    } catch (error) {
        // Keep the URL visible when a very old WhatsApp client rejects Native Flow.
        console.warn('[repo] Native Flow unavailable:', error.message);
        const fallback = { text: repoCaption(), ...channelInfo };
        if (image) await sock.sendMessage(chatId, { image, caption: repoCaption(), ...channelInfo }, { quoted: message });
        else await sock.sendMessage(chatId, fallback, { quoted: message });
    }
}

module.exports = repoCommand;
