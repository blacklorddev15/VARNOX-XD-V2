'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const settings = require('../settings');
const { getPrefix } = require('../lib/prefix');

// The name shown in the menu and on forwarded messages.
const BOT_NAME = 'VARNOX X ULTRA';
const CORE_NAME = '𝐗 𝐔𝐋𝐓𝐑𝐀';

const MENU_IMAGES = [
  // Keep the original image as the first rotation entry.
  path.join(__dirname, '../assets/menu-style.jpg'),
  path.join(__dirname, '../assets/menu-style-2.jpg'),
  path.join(__dirname, '../assets/menu-style-3.jpg'),
  path.join(__dirname, '../assets/menu-style-4.jpg')
];
let menuImageCursor = 0;

function nextMenuImage() {
  for (let attempt = 0; attempt < MENU_IMAGES.length; attempt += 1) {
    const imagePath = MENU_IMAGES[menuImageCursor % MENU_IMAGES.length];
    menuImageCursor = (menuImageCursor + 1) % MENU_IMAGES.length;
    if (fs.existsSync(imagePath)) return imagePath;
  }
  return null;
}

const channelInfo = {
  contextInfo: {
    forwardingScore: 1,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
      newsletterJid: '120363424782348922@newsletter',
      newsletterName: BOT_NAME,
      serverMessageId: -1
    }
  }
};

// ── Drawing parts ────────────────────────────────────────────────────────────
// These two lines bracket every box. Kept as constants so the boxes cannot drift
// apart, and so a copy-paste of the menu keeps its alignment.
const BOX_TOP = '╭═━⪩';
const BOX_END = '╰━━━━━━━━━━━━━━━━━━•⩵꙰ཱི࿐';
const BOX_TAIL = '•━•⩵꙰ཱི࿐';

const BANNER = `•━═ 〘  _*~${BOT_NAME}~*_   〙═━•`;
const CENTRE = `> •━══〘 𝑪𝑶𝑴𝑴𝑨𝑵𝑫 𝑪𝑬𝑵𝑻𝑹𝑬 〙${BOX_TAIL}`;
const FOOTER = '> ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴠᴀʀɴᴏx x ᴜʟᴛʀᴀ';

// ── Categories ───────────────────────────────────────────────────────────────
// Every entry here is a command this bot actually answers to: the list was taken
// from the dispatch switch in main.js, not written by hand, so the menu cannot
// advertise something that does nothing. Category names follow the requested
// design; membership follows what each command does.
const categories = [
  {
    key: 'settings',
    title: 'SETTINGS',
    aliases: ['setting', 'parametres', 'config'],
    commands: [
      'alive', 'antidelete', 'anticall', 'antibot', 'antiflood', 'antispam', 'antimedia',
      'antivoice', 'areact', 'autostatus', 'autoread', 'autoreact', 'autoreaction',
      'autotyping', 'ban', 'chatbot', 'cleartmp', 'clearsession', 'clearsesi', 'fakeract',
      'mode', 'pmblocker', 'setpp', 'settings', 'sudo', 'unban', 'update'
    ]
  },
  {
    key: 'groups',
    title: 'GROUPS',
    aliases: ['group', 'groupe', 'groupes'],
    commands: [
      'admins', 'anularlink', 'antibadword', 'antilink', 'antimentiongc', 'antipromote', 'antisticker',
      'antitag', 'clear', 'close', 'del', 'delete', 'deleteall', 'demote', 'demoteadmin',
      'goodbye', 'groupinfo', 'hidetag', 'infogp', 'infogrupo', 'kick', 'kickall', 'kickall2',
      'kicktime', 'leaves', 'listadmin', 'move', 'mute', 'open', 'promote', 'promotetime',
      'resetlink', 'revoke', 'setgdesc', 'setgname', 'setgpp', 'setmention', 'staff', 'tag',
      'tagall', 'tagnotadmin', 'unmute', 'warn', 'warnings', 'welcome'
    ]
  },
  {
    key: 'ai',
    title: 'AI',
    aliases: ['ia'],
    commands: ['answer', 'character', 'gemini', 'gpt']
  },
  {
    key: 'anime',
    title: 'ANIME',
    aliases: ['roleplay', 'rp'],
    commands: [
      'animu', 'animuquote', 'cry', 'hug', 'kiss', 'loli', 'lolice', 'lovenight', 'nom',
      'oogway', 'oogway2', 'pat', 'poke', 'roseday', 'tonikawa', 'wink'
    ]
  },
  {
    key: 'imgmaker',
    title: 'IMG MAKER',
    aliases: ['image', 'img', 'maker'],
    commands: [
      'arena', 'attp', 'blackpink', 'blur', 'china', 'circle', 'comrade', 'crop', 'dalle',
      'devil', 'face-palm', 'facepalm', 'fire', 'flux', 'gay', 'glass', 'glitch', 'hacker',
      'horny', 'ice', 'imagine', 'impressive', 'india', 'indonesia', 'iss', 'its-so-stupid',
      'itssostupid', 'jail', 'japan', 'korea', 'lgbt', 'light', 'malaysia', 'matrix',
      'metallic', 'namecard', 'neon', 'passed', 'pies', 'purple', 'sand', 'simp', 'simpcard',
      'snow', 'sora', 'stupid', 'thailand', 'thunder', 'triggered', 'tweet', 'waste'
    ]
  },
  {
    key: 'convert',
    title: 'CONVERT',
    aliases: ['conversion', 'converter'],
    commands: [
      'emix', 'emojimix', 'enhance', 'igs', 'igsc', 'nobg', 'remini', 'removebg', 'rmbg',
      's', 'screenshot', 'simage', 'ss', 'ssweb', 'steal', 'sticker', 'stickertelegram',
      'take', 'telesticker', 'tg', 'tgsticker', 'tourl', 'translate', 'trt', 'tts', 'upscale',
      'url', 'vv', 'vv2'
    ]
  },
  {
    key: 'fun',
    title: 'FUN',
    aliases: ['games', 'game', 'jeux'],
    commands: [
      '1917', '8ball', 'compliment', 'dare', 'fact', 'flirt', 'gn', 'goodnight', 'guess',
      'hangman', 'heart', 'insult', 'joke', 'meme', 'quote', 'shayari', 'shayri', 'ship',
      'tictactoe', 'trivia', 'truth', 'ttt'
    ]
  },
  {
    key: 'downloads',
    title: 'DOWNLOADS',
    aliases: ['download', 'dl', 'media'],
    commands: [
      'fb', 'facebook', 'git', 'github', 'ig', 'insta', 'instagram', 'lyrics', 'mp3', 'music',
      'play', 'repo', 'song', 'spotify', 'tt', 'tiktok', 'video', 'ytcomment', 'ytmp3', 'ytmp4'
    ]
  },
  {
    key: 'general',
    title: 'GENERAL',
    aliases: ['misc', 'others', 'main'],
    commands: [
      'allmenu', 'bot', 'help', 'jid', 'list', 'menu', 'news', 'owner', 'ping', 'profil',
      'profile', 'sc', 'script', 'stats', 'surrender', 'topmembers', 'weather'
    ]
  }
];

const commandCount = categories.reduce((total, category) => total + category.commands.length, 0);

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function titleCase(command) {
  return command.charAt(0).toUpperCase() + command.slice(1);
}

function platformLine() {
  const platform = process.platform;
  const names = { linux: 'Linux', darwin: 'macOS', win32: 'Windows', freebsd: 'FreeBSD' };
  const icons = { linux: '🐧', darwin: '🍎', win32: '🪟', freebsd: '😈' };
  return `${icons[platform] || '💻'} ${names[platform] || platform}`;
}

/** Ten blocks, rounded to the nearest tenth, for a bar that reads at a glance. */
function ramBar(percent) {
  const filled = Math.max(0, Math.min(10, Math.round(percent / 10)));
  return `[${'█'.repeat(filled)}${'░'.repeat(10 - filled)}]`;
}

function uptimeLine() {
  const seconds = Math.floor(process.uptime());
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m ${seconds % 60}s`;
}

/**
 * The status box.
 *
 * Every value is read at the moment the menu is built — uptime, memory, the RAM bar and the
 * toolset count are all live. The speed figure is how long this box took to assemble, so it is a
 * real measurement of the bot rather than a decorative constant.
 */
function menuHeader(senderNum, prefix) {
  const startedAt = process.hrtime.bigint();
  const memory = process.memoryUsage();
  const usedMb = (memory.rss / 1024 / 1024).toFixed(1);
  const totalGb = (os.totalmem() / 1024 / 1024 / 1024).toFixed(2);
  const ramPercent = Math.min(100, Math.round((memory.rss / os.totalmem()) * 100));

  const lines = [
    `> ${BOX_TOP} 〘 𝑺𝒀𝑺𝑻𝑬𝑴 𝑺𝑻𝑨𝑻𝑼𝑺 〙${BOX_TAIL}`,
    `> │⫹⫺ 𝗖𝗢𝗥𝗘: _*~${CORE_NAME}~*_ 🟢`,
    `> │⫹⫺ 𝗕𝗨𝗜𝗟𝗗 𝗜𝗗: v${settings.version || '2.0.0'}`,
    `> │⫹⫺ 𝗢𝗪𝗡𝗘𝗥: ${settings.menuOwner || settings.botOwner || 'VARNOX'}`,
    `> │⫹⫺ 𝗢𝗣𝗘𝗥𝗔𝗧𝗜𝗢𝗡: 🔒 Private`,
    `> │⫹⫺ 𝗨𝗣𝗧𝗜𝗠𝗘: ⏱️ ${uptimeLine()}`,
    null,
    `> │⫹⫺ 𝗧𝗢𝗢𝗟𝗦𝗘𝗧: ${commandCount}`,
    `> │⫹⫺ 𝗤𝗨𝗜𝗖𝗞 𝗞𝗘𝗬: ${prefix}`,
    `> │⫹⫺ 𝗡𝗘𝗧𝗪𝗢𝗥𝗞: ${platformLine()}`,
    `> │⫹⫺ 𝗠𝗘𝗠𝗢𝗥𝗬: ${usedMb} MB of ${totalGb} GB`,
    `> │⫹⫺ 𝗥𝗔𝗠: ${ramBar(ramPercent)} ${ramPercent}%`,
    `> ${BOX_END}`
  ];

  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
  lines[6] = `> │⫹⫺ 𝗦𝗣𝗘𝗘𝗗: ${elapsedMs.toFixed(2)} ms`;

  return lines.join('\n');
}

/**
 * One category box.
 *
 * Commands are printed without the prefix, matching the requested layout — the prefix is shown
 * once in the status box under QUICK KEY. Add `${prefix}` in front of titleCase(command) if you
 * would rather every line be copy-pasteable.
 */
function categoryBox(category) {
  return [
    `> ${BOX_TOP} 〖  ${category.title}  〗═══${BOX_TAIL}`,
    ...category.commands.map(command => `> │❍ ${titleCase(command)}`),
    `> ${BOX_END}`
  ].join('\n');
}

function categoryIndex(query) {
  const normalized = normalize(query);
  if (/^\d+$/.test(String(query).trim())) {
    const index = Number(query) - 1;
    return categories[index] ? index : -1;
  }
  return categories.findIndex(category => (
    normalize(category.key) === normalized ||
    normalize(category.title) === normalized ||
    (category.aliases || []).some(alias => normalize(alias) === normalized)
  ));
}

function overview(senderNum, prefix, notice = '') {
  const categoryLines = categories.map((category, index) =>
    `> │❍ ${String(index + 1).padStart(2, '0')} • ${category.title}`
  );

  return [
    notice ? `${notice}\n` : null,
    BANNER,
    '',
    menuHeader(senderNum, prefix),
    '',
    CENTRE,
    '',
    `> ${BOX_TOP} 〖  CATEGORIES  〗═══${BOX_TAIL}`,
    ...categoryLines,
    `> ${BOX_END}`,
    '',
    `> 💡 ᴛʏᴘᴇ *${prefix}menu <number>* ᴏʀ *${prefix}menu <name>* ꜰᴏʀ ᴀ ꜱɪɴɢʟᴇ ᴄᴀᴛᴇɢᴏʀʏ.`,
    `> 💡 ᴛʏᴘᴇ *${prefix}allmenu* ᴛᴏ ꜱᴇᴇ ᴇᴠᴇʀʏ ᴄᴏᴍᴍᴀɴᴅ.`,
    '',
    FOOTER
  ].filter(line => line !== null).join('\n');
}

function allMenu(senderNum, prefix) {
  return [
    BANNER,
    '',
    menuHeader(senderNum, prefix),
    '',
    CENTRE,
    '',
    categories.map(category => categoryBox(category)).join('\n\n'),
    '',
    `> 💡 ᴜꜱᴇ *${prefix}menu* ᴛᴏ ɢᴏ ʙᴀᴄᴋ ᴛᴏ ᴛʜᴇ ᴄᴀᴛᴇɢᴏʀɪᴇꜱ.`,
    '',
    FOOTER
  ].join('\n');
}

async function sendMenu(sock, chatId, message, text, senderId, withImage) {
  const payload = {
    caption: text,
    mentions: [senderId],
    ...channelInfo
  };

  if (withImage) {
    const imagePath = nextMenuImage();
    try {
      if (!imagePath) throw new Error('No menu image available');
      await sock.sendMessage(chatId, {
        image: fs.readFileSync(imagePath),
        ...payload
      }, { quoted: message });
      return;
    } catch (error) {
      console.error('[menu] image failed, sending text:', error.message);
    }
  }

  await sock.sendMessage(chatId, {
    text,
    mentions: [senderId],
    ...channelInfo
  }, { quoted: message });
}

async function helpCommand(sock, chatId, message, query = '') {
  const senderId = message.key.participant || message.key.remoteJid || '';
  const senderNum = senderId.split('@')[0] || '?';
  const prefix = getPrefix(chatId);
  const normalizedQuery = String(query || '').trim();

  if (!normalizedQuery || ['menu', 'categories', 'category'].includes(normalize(normalizedQuery))) {
    await sendMenu(sock, chatId, message, overview(senderNum, prefix), senderId, true);
    return;
  }

  if (['all', 'allmenu', 'full', 'tout'].includes(normalize(normalizedQuery))) {
    await sendMenu(sock, chatId, message, allMenu(senderNum, prefix), senderId, true);
    return;
  }

  const index = categoryIndex(normalizedQuery);
  if (index < 0) {
    await sendMenu(
      sock,
      chatId,
      message,
      overview(senderNum, prefix, `⚠️ ᴜɴᴋɴᴏᴡɴ ᴄᴀᴛᴇɢᴏʀʏ: *${normalizedQuery}*`),
      senderId,
      true
    );
    return;
  }

  const category = categories[index];
  await sendMenu(
    sock,
    chatId,
    message,
    [
      BANNER,
      '',
      menuHeader(senderNum, prefix),
      '',
      CENTRE,
      '',
      categoryBox(category),
      '',
      `> 💡 ᴜꜱᴇ *${prefix}menu* ᴛᴏ ɢᴏ ʙᴀᴄᴋ ᴛᴏ ᴛʜᴇ ᴄᴀᴛᴇɢᴏʀɪᴇꜱ.`,
      '',
      FOOTER
    ].join('\n'),
    senderId,
    true
  );
}

module.exports = helpCommand;
