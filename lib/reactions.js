'use strict';
const fs   = require('fs');
const path = require('path');

// ─── Per-command emoji map ────────────────────────────────────────────────────
// Used when auto-react is ON to give instant visual feedback per command type.
const EMOJI_MAP = {
  // Status / info
  '.ping'        : '🏓',
  '.alive'       : '💚',
  '.help'        : '📖', '.menu'      : '📖', '.bot'      : '📖', '.list'   : '📖',
  '.settings'    : '⚙️',  '.mode'      : '⚙️',
  '.owner'       : '👑',
  '.sudo'        : '🛡️',
  '.update'      : '🔄',
  '.github'      : '💻', '.git'       : '💻', '.sc'       : '💻', '.repo'   : '💻', '.script': '💻',
  '.jid'         : '🔢',
  '.debug'       : '🔍',

  // Group management
  '.tagall'      : '📢',
  '.tag'         : '🏷️',
  '.hidetag'     : '👻',
  '.tagnotadmin' : '📣',
  '.ban'         : '🚫',
  '.unban'       : '✅',
  '.kick'        : '👢',
  '.mute'        : '🔇',
  '.unmute'      : '🔊',
  '.promote'     : '⬆️',
  '.demote'      : '⬇️',
  '.warn'        : '⚠️',
  '.warnings'    : '📋',
  '.clear'       : '🧹',
  '.resetlink'   : '🔗', '.revoke'    : '🔗', '.anularlink': '🔗',
  '.staff'       : '👑', '.admins'    : '👑', '.listadmin' : '👑',
  '.groupinfo'   : '📊', '.infogp'    : '📊', '.infogrupo' : '📊',
  '.groupid'     : '🆔', '.members'   : '👥', '.nonadmins' : '👥',
  '.mentionall'  : '📢', '.mentionadmins': '👑', '.mentionnonadmins': '👥',
  '.groupstats'  : '📊', '.groupcreated': '📅', '.groupaudit': '🔎',
  '.groupmenu'   : '📚', '.rules'     : '📜', '.setrules'  : '📝',
  '.clearrules'  : '🧹', '.poll'      : '📊',
  '.setgdesc'    : '📝',
  '.setgname'    : '✏️',
  '.setgpp'      : '🖼️',
  '.welcome'     : '👋',
  '.goodbye'     : '👋',
  '.topmembers'  : '🏆',

  // Moderation toggles
  '.antilink'    : '🔗',
  '.antitag'     : '🔒',
  '.antibot'     : '🤖',
  '.antibadword' : '🔞',
  '.antidelete'  : '🛡️',
  '.anticall'    : '📵',
  '.antiflood'   : '🚦', '.antispam' : '🛡️', '.antimedia': '🚫',
  '.antisticker' : '🚫', '.antivoice': '🔇', '.antipromote': '🛡️',
  '.antimentiongc': '🛡️', '.antidm': '📵',
  '.pmblocker'   : '✉️',
  '.chatbot'     : '💬',
  '.mention'     : '📩',
  '.setmention'  : '📩',

  // Auto features
  '.autostatus'  : '📡',
  '.autotyping'  : '⌨️',
  '.autoread'    : '👁️',
  '.areact'      : '😊', '.autoreact'  : '😊', '.autoreaction': '😊',

  // Media / stickers
  '.sticker'     : '🎨', '.s'          : '🎨',
  '.attp'        : '🎨',
  '.simage'      : '🖼️',
  '.blur'        : '🌫️',
  '.emojimix'    : '😊', '.emix'       : '😊',
  '.crop'        : '✂️',
  '.tg'          : '✈️',  '.stickertelegram': '✈️',
  '.take'        : '🎭', '.steal'      : '🎭',
  '.viewonce'    : '👁️', '.🥷'         : '👁️',
  '.profile'     : '👤', '.profil'    : '👤',
  '.hijack'      : '🔐',
  '.setpp'       : '🖼️',
  '.removebg'    : '✂️', '.rmbg'       : '✂️', '.nobg'      : '✂️',
  '.remini'      : '✨',  '.enhance'   : '✨',  '.upscale'   : '✨',
  '.imagine'     : '🎨', '.flux'       : '🎨', '.dalle'     : '🎨',
  '.img-blur'    : '🌫️',
  '.wasted'      : '💀',
  '.waste'       : '💀',
  '.simp'        : '😳',
  '.stupid'      : '🤦', '.iss'        : '🤦',
  '.ship'        : '💞',
  '.character'   : '🦸',
  '.pies'        : '🏳️',
  '.china'       : '🇨🇳',
  '.japan'       : '🇯🇵',
  '.korea'       : '🇰🇷',
  '.india'       : '🇮🇳',
  '.indonesia'   : '🇮🇩',
  '.malaysia'    : '🇲🇾',
  '.thailand'    : '🇹🇭',

  // Text effects
  '.metallic'    : '🔩', '.ice'        : '🧊', '.snow'      : '❄️',
  '.impressive'  : '💫', '.matrix'     : '🖥️', '.light'     : '💡',
  '.neon'        : '🌈', '.devil'      : '😈', '.purple'    : '💜',
  '.thunder'     : '⚡', '.leaves'     : '🍃', '.1917'      : '🎬',
  '.arena'       : '⚔️',  '.hacker'    : '💻', '.sand'      : '🏜️',
  '.blackpink'   : '🌸', '.glitch'     : '🔮', '.fire'      : '🔥',

  // Downloads
  '.play'        : '🎵', '.mp3'        : '🎵', '.ytmp3'     : '🎵',
  '.song'        : '🎵', '.music'      : '🎵',
  '.video'       : '🎬', '.ytmp4'      : '🎬',
  '.tiktok'      : '🎵', '.tt'         : '🎵',
  '.instagram'   : '📸', '.insta'      : '📸', '.ig'        : '📸',
  '.fb'          : '📘', '.facebook'   : '📘',
  '.spotify'     : '🎧',

  // AI / tools
  '.gpt'         : '🤖', '.gemini'     : '🤖', '.sora'      : '🤖',
  '.ai'          : '🤖',
  '.translate'   : '🌍', '.trt'        : '🌍',
  '.tts'         : '🎙️',
  '.ss'          : '📸', '.ssweb'      : '📸', '.screenshot': '📸',
  '.url'         : '🔗', '.tourl'      : '🔗',
  '.weather'     : '🌤️',
  '.news'        : '📰',
  '.lyrics'      : '🎼',
  '.igs'         : '📸', '.igsc'       : '📸',
  '.anime'       : '🌸',  '.animu'     : '🌸',

  // Fun
  '.joke'        : '😂',
  '.meme'        : '😹',
  '.fact'        : '📚',
  '.quote'       : '💬',
  '.dare'        : '😈',
  '.truth'       : '🤔',
  '.flirt'       : '💕',
  '.compliment'  : '💐',
  '.insult'      : '😤',
  '.8ball'       : '🎱',
  '.goodnight'   : '🌙', '.gn'         : '🌙', '.lovenight' : '🌙',
  '.shayari'     : '✍️',  '.shayri'    : '✍️',
  '.roseday'     : '🌹',
  '.heart'       : '❤️',
  '.nom'         : '😋', '.poke'       : '👉', '.cry'       : '😭',
  '.kiss'        : '💋', '.pat'        : '🤗', '.hug'       : '🤗', '.wink'  : '😉',
  '.facepalm'    : '🤦', '.loli'       : '🌸',

  // Games
  '.ttt'         : '🎮', '.tictactoe'  : '🎮', '.move'      : '🎮',
  '.hangman'     : '🎮', '.guess'      : '🔤',
  '.trivia'      : '❓', '.answer'     : '💡',
  '.surrender'   : '🏳️',

  // Delete / session
  '.delete'      : '🗑️', '.del'        : '🗑️',
  '.cleartmp'    : '🧹',
  '.clearsession': '🔄', '.clearsesi'  : '🔄',

  // Misc
  '.tweet'       : '🐦',
  '.ytcomment'   : '📹',
  '.comrade'     : '👥',  '.gay'       : '🌈', '.glass'     : '🥂',
  '.jail'        : '⛓️', '.passed'     : '✅',  '.triggered' : '😡',
  '.horny'       : '🔞',  '.circle'    : '⭕', '.lgbt'      : '🌈',
  '.lolice'      : '🚓',  '.simpcard'  : '😳', '.tonikawa'  : '💘',
  '.namecard'    : '📛',  '.oogway'    : '🐢',
  '.tourl'       : '🔗',
};

/** Fallbacks are rotated so unknown commands never get one fixed reaction. */
const FALLBACK_EMOJIS = ['⚡', '✅', '🔥', '🚀', '💠', '🛡️'];

/** Returns a stable, useful emoji for every command (e.g. '.ping'). */
function getCommandEmoji(cmdKey) {
  const key = String(cmdKey || '').trim().toLowerCase().split(/\s+/)[0];
  if (EMOJI_MAP[key]) return EMOJI_MAP[key];
  const hash = Array.from(key).reduce((total, character) => total + character.charCodeAt(0), 0);
  return FALLBACK_EMOJIS[hash % FALLBACK_EMOJIS.length];
}

// ─── Persistent state ─────────────────────────────────────────────────────────
const USER_GROUP_DATA = path.join(__dirname, '../data/userGroupData.json');

function loadAutoReactionState() {
  try {
    if (fs.existsSync(USER_GROUP_DATA)) {
      const data = JSON.parse(fs.readFileSync(USER_GROUP_DATA, 'utf8'));
      // Only respect saved state if the user explicitly turned it OFF (false).
      // Any missing/undefined value → ON (fresh deploy / first run).
      if (data.autoReaction === false) return false;
    }
  } catch {}
  return true; // default ON on every fresh deploy
}

function saveAutoReactionState(state) {
  try {
    const data = fs.existsSync(USER_GROUP_DATA)
      ? JSON.parse(fs.readFileSync(USER_GROUP_DATA, 'utf8'))
      : { groups: [], chatbot: {} };
    data.autoReaction = state;
    fs.writeFileSync(USER_GROUP_DATA, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('[reactions] saveAutoReactionState error:', e.message);
  }
}

let isAutoReactionEnabled = loadAutoReactionState();

// ─── Public API ───────────────────────────────────────────────────────────────

// ─── Emojis "all replies" — reaction to normal messages ───────────────────────
// Used when autoreact ALL is enabled (non-command messages)
const ALL_MSG_EMOJIS = ['❤️', '🔥', '😊', '👍', '✨', '💯', '🫶', '😎', '💪', '🙌'];
let _allMsgIdx = 0;
function nextAllMsgEmoji() {
  const e = ALL_MSG_EMOJIS[_allMsgIdx % ALL_MSG_EMOJIS.length];
  _allMsgIdx++;
  return e;
}

/**
 * Reacts to a command with the appropriate emoji.
 * ALWAYS active — independent of the .areact on/off state.
 * The .areact toggle only controls the reaction to normal messages.
 *
 * @param {object} sock    - Socket Baileys
 * @param {object} message - Message WA
 * @param {string} cmdKey  - Command key e.g.: '.ping', '.tagall'
 */
async function addCommandReaction(sock, message, cmdKey) {
  try {
    if (!message?.key?.id) return;
    const emoji = getCommandEmoji(cmdKey);
    await sock.sendMessage(message.key.remoteJid, {
      react: { text: emoji, key: message.key }
    });
  } catch (e) {
    // Silent — a reaction failure must never crash a command
  }
}

/**
 * Reacts to ALL messages (groups AND PMs) when autoreact all is enabled.
 * Called from main.js on incoming non-command messages.
 *
 * @param {object} sock    - Socket Baileys
 * @param {object} message - Message WA
 */
async function addAllMessageReaction(sock, message) {
  try {
    if (!isAutoReactionEnabled) return;
    if (!message?.key?.id) return;
    // Do not react to messages sent by the bot itself
    if (message.key.fromMe) return;
    const emoji = nextAllMsgEmoji();
    await sock.sendMessage(message.key.remoteJid, {
      react: { text: emoji, key: message.key }
    });
  } catch (e) {
    // Silencieux
  }
}

/**
 * Handles .areact / .autoreact on|off
 * When ON  → reacts to ALL messages (groups + PMs) in addition to commands
 * When OFF → reacts only to commands (default behaviour)
 */
async function handleAreactCommand(sock, chatId, message, isOwner) {
  try {
    if (!isOwner) {
      await sock.sendMessage(chatId, {
        text: '❌ Command reserved for the owner.',
      }, { quoted: message });
      return;
    }

    const text = (
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text || ''
    ).trim().toLowerCase();

    const action = text.split(/\s+/)[1];

    if (action === 'on') {
      isAutoReactionEnabled = true;
      saveAutoReactionState(true);
      await sock.sendMessage(chatId, {
        text:
          `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔⌟\n` +
          `┃⌬┃ ✅ *Autoreact enabled !*\n` +
          `┃⌬┃\n` +
          `┃⌬┃ The bot will now react to\n` +
          `┃⌬┃ *all* incoming messages\n` +
          `┃⌬┃ (groups and PMs).\n` +
          `┃⌬┃\n` +
          `┃⌬┃ Command reactions\n` +
          `┃⌬┃ are always active.\n` +
          `╰━━━━━━━━━━━━❍`,
      }, { quoted: message });
    } else if (action === 'off') {
      isAutoReactionEnabled = false;
      saveAutoReactionState(false);
      await sock.sendMessage(chatId, {
        text:
          `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔⌟\n` +
          `┃⌬┃ 🔕 *Autoreact disabled*\n` +
          `┃⌬┃\n` +
          `┃⌬┃ The bot will no longer react to\n` +
          `┃⌬┃ normal messages.\n` +
          `┃⌬┃\n` +
          `┃⌬┃ Command reactions\n` +
          `┃⌬┃ remain always active.\n` +
          `╰━━━━━━━━━━━━❍`,
      }, { quoted: message });
    } else {
      const state = isAutoReactionEnabled ? '✅ enabled' : '🔕 disabled';
      await sock.sendMessage(chatId, {
        text:
          `╭━━━━⌜𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔⌟\n` +
          `┃⌬┃ 😊 *Autoreact : ${state}*\n` +
          `┃⌬┃\n` +
          `┃⌬┃ *.areact on*  — enable\n` +
          `┃⌬┃ *.areact off* — disable\n` +
          `┃⌬┃\n` +
          `┃⌬┃ ℹ️ Reactions to commands\n` +
          `┃⌬┃ are always active.\n` +
          `╰━━━━━━━━━━━━❍`,
      }, { quoted: message });
    }
  } catch (e) {
    console.error('[reactions] handleAreactCommand error:', e.message);
  }
}

module.exports = { addCommandReaction, addAllMessageReaction, handleAreactCommand, getCommandEmoji };
