const axios = require('axios');
const { sleep } = require('../lib/myfunc');
const settings = require('../settings');

/**
 * .pair command — Generates a WhatsApp pairing code
 * Uses the /code API of the VARNOX X ULTRA web panel
 */
async function pairCommand(sock, chatId, message, q) {
    try {
        if (!q) {
            return await sock.sendMessage(chatId, {
                text: `📱 *VARNOX X ULTRA — Pair Code*\n\nUsage: *.pair <number>*\nExample: *.pair 224610835573*\n\nOr visit the web panel:\n${settings.pairApiUrl}`,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363424782348922@newsletter',
                        newsletterName: '𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔',
                        serverMessageId: -1
                    }
                }
            });
        }

        const numbers = q.split(',')
            .map((v) => v.replace(/[^0-9]/g, ''))
            .filter((v) => v.length > 5 && v.length < 20);

        if (numbers.length === 0) {
            return await sock.sendMessage(chatId, {
                text: '❌ Invalid number. Format: *.pair 224610835573*',
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363424782348922@newsletter',
                        newsletterName: '𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔',
                        serverMessageId: -1
                    }
                }
            });
        }

        for (const number of numbers) {
            await sock.sendMessage(chatId, {
                text: `⏳ Generating the code for *${number}*...\nWait ~10 seconds.`,
                contextInfo: {
                    forwardingScore: 1,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: '120363424782348922@newsletter',
                        newsletterName: '𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔',
                        serverMessageId: -1
                    }
                }
            });

            try {
                // Call our own Vercel API (more reliable than a third-party service)
                const baseUrl = String(settings.pairApiUrl || '').replace(/\/+$/, '');
                const response = await axios.get(`${baseUrl}/code`, {
                    params: { number },
                    timeout: 60000,
                    validateStatus: status => status >= 200 && status < 500
                });

                if (response.data?.code && !response.data?.error) {
                    const code = response.data.code;
                    await sleep(2000);
                    await sock.sendMessage(chatId, {
                        text: `✅ *WhatsApp Pairing Code*\n\n🔑 Code: *${code}*\n\n📱 How to use:\n1. Open WhatsApp\n2. Settings → Linked devices\n3. Link a device → Link with phone number\n4. Enter the code above\n\n⚠️ The code expires in a few minutes.`,
                        contextInfo: {
                            forwardingScore: 1,
                            isForwarded: true,
                            forwardedNewsletterMessageInfo: {
                                newsletterJid: '120363424782348922@newsletter',
                                newsletterName: '𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔',
                                serverMessageId: -1
                            }
                        }
                    });
                } else {
                    throw new Error(response.data?.message || response.data?.error || `HTTP ${response.status}`);
                }
            } catch (apiError) {
                console.error('[pair.js] API error:', apiError.message);
                await sock.sendMessage(chatId, {
                    text: `❌ Failed to generate the code: ${apiError.message}\n\nTry directly at:\n${settings.pairApiUrl}`,
                    contextInfo: {
                        forwardingScore: 1,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: '120363424782348922@newsletter',
                            newsletterName: '𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔',
                            serverMessageId: -1
                        }
                    }
                });
            }
        }
    } catch (error) {
        console.error('[pair.js] General error:', error);
        await sock.sendMessage(chatId, {
            text: "❌ An error occurred. Try again or visit: " + settings.pairApiUrl,
            contextInfo: {
                forwardingScore: 1,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363424782348922@newsletter',
                    newsletterName: '𝗩𝗔𝗥𝗡𝗢𝗫 𝗫 𝗨𝗟𝗧𝗥𝗔',
                    serverMessageId: -1
                }
            }
        });
    }
}

module.exports = pairCommand;
