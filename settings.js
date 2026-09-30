const settings = {
  // ════════════════════════════════════════════════════
  //    🥷 YOUR BOT CONFIGURATION — FILL IN HERE
  // ════════════════════════════════════════════════════

  packname: '𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔',          // Sticker pack name
  author: '𝗩꯭𝗔꯭𝗥꯭𝗡꯭𝗢꯭𝗫꯭͡ 𝗫꯭𝗧꯭𝗘꯭𝗖꯭𝗛꯭͡',               // Your name
  botName: "𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔",           // Displayed bot name
  botOwner: '𝗩꯭𝗔꯭𝗥꯭𝗡꯭𝗢꯭𝗫꯭͡ 𝗫꯭𝗧꯭𝗘꯭𝗖꯭𝗛꯭͡',             // Your real name
  menuOwner: 'ʋαɾɳσx',
  developer: 'ʋαɾɳσx Tech',

  // ⚠️ Your WhatsApp number WITHOUT the + (e.g. 224621000000)
  ownerNumber: process.env.OWNER_NUMBER || '224669288332',

  giphyApiKey: process.env.GIPHY_API_KEY || '',
  commandMode: "public",               // "public" or "private"
  maxStoreMessages: 20,
  storeWriteInterval: 10000,
  description: "Multi-purpose WhatsApp bot.",
  version: "2.0.0",
  commandCount: 148,

  // Your GitHub link (optional)
  updateZipUrl: "https://github.com/mohamedsoumahv99-bot/VARNOX-XD-V2/archive/refs/heads/main.zip",

  // Panel URL — auto-detection Render / Railway / Vercel / fallback
  pairApiUrl: process.env.RENDER_EXTERNAL_URL
    ? process.env.RENDER_EXTERNAL_URL
    : process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.PANEL_URL
    || "https://varnox-xd-v2.onrender.com",
};

module.exports = settings;
