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

  // ════════════════════════════════════════════════════
  //   🗄️  WEBSITE DATABASE
  // ════════════════════════════════════════════════════
  // Used to link this bot to the VARNOX website. Read LAST, so anything supplied
  // by the host wins over it. Order:
  //
  //   1. DATABASE_URL in the environment   (Render / panel egg variable)
  //   2. DATABASE_URL in .env
  //   3. database-url.txt in this folder
  //   4. databaseUrl below                 ← this line
  //
  // It is here so the panel cannot hide it and no egg variable is required. Put
  // the whole connection string in the quotes, on one line:
  //
  //   databaseUrl: 'postgresql://user:pass@host/db?sslmode=require',
  //
  // ⚠️ WARNING — this file is tracked in a PUBLIC repository. If you commit and
  // push it with the password filled in, that password is public forever, and it
  // grants full access to every table in that database. Keep the filled-in copy
  // on the server only: never `git add settings.js` after pasting a real value.
  // Leave it '' and use .env or database-url.txt instead if you can.
  databaseUrl: '',

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
