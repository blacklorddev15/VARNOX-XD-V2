'use strict';

const fs = require('fs');
const path = require('path');
const isAdmin = require('../lib/isAdmin');
const { channelInfo } = require('../lib/messageConfig');

const STATE_FILE = path.join(__dirname, '../data/group-extras.json');

const GROUP_COMMANDS = [
    'groupid', 'members', 'admins', 'nonadmins', 'mentionall', 'mentionadmins',
    'mentionnonadmins', 'groupstats', 'groupcreated', 'rules', 'setrules',
    'clearrules', 'announce', 'grouplink', 'revokeinvite', 'lockchat',
    'unlockchat', 'restrictchat', 'unrestrictchat', 'slowmode', 'clearwarns',
    'promoteall', 'demoteall', 'approveall', 'kickbots', 'poll', 'groupaudit',
    'groupmenu', 'openchat', 'closechat'
];

function ensureState() {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(STATE_FILE)) fs.writeFileSync(STATE_FILE, '{}');
}

function readState() {
    ensureState();
    try {
        const value = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        return value && typeof value === 'object' ? value : {};
    } catch {
        return {};
    }
}

function writeState(value) {
    ensureState();
    const temp = `${STATE_FILE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(value, null, 2));
    fs.renameSync(temp, STATE_FILE);
}

function participantNumber(participant) {
    return String(participant?.id || participant?.jid || '').split(':')[0].split('@')[0];
}

function mentionJids(participants) {
    return participants.map(participant => participant.id || participant.jid).filter(Boolean);
}

function getTargets(message) {
    const context = message.message?.extendedTextMessage?.contextInfo;
    const mentions = context?.mentionedJid || [];
    if (mentions.length) return mentions;
    if (context?.participant) return [context.participant];
    return [];
}

async function metadata(sock, chatId) {
    return sock.groupMetadata(chatId);
}

async function requireAdmin(sock, chatId, message, owner) {
    const status = await isAdmin(sock, chatId, message.key.participant || message.key.remoteJid);
    if (!owner && !status.isSenderAdmin) {
        await sock.sendMessage(chatId, { text: '❌ This command is reserved for admins.' }, { quoted: message });
        return null;
    }
    return status;
}

async function requireBotAdmin(sock, chatId, message, owner) {
    const status = await requireAdmin(sock, chatId, message, owner);
    if (!status) return null;
    if (!owner && !status.isBotAdmin) {
        await sock.sendMessage(chatId, {
            text: '⚠️ WhatsApp refused this action: it is reserved for group admins.'
        }, { quoted: message });
        return null;
    }
    return status;
}

function groupState(chatId) {
    const state = readState();
    state[chatId] ||= {};
    return state;
}

async function handleGroupExtraCommand(sock, chatId, message, command, args, owner = false) {
    if (!GROUP_COMMANDS.includes(command)) return false;
    if (!chatId.endsWith('@g.us')) {
        await sock.sendMessage(chatId, { text: '❌ This command only works in a group.' }, { quoted: message });
        return true;
    }

    const meta = await metadata(sock, chatId);
    const participants = meta.participants || [];
    const admins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin');
    const nonAdmins = participants.filter(p => !p.admin);
    const mentions = mentionJids(participants);
    const commandArgs = args.join(' ').trim();

    switch (command) {
        case 'groupid':
            await sock.sendMessage(chatId, { text: `✅ Group JID: ${chatId}` }, { quoted: message });
            break;
        case 'members':
            await sock.sendMessage(chatId, { text: `👥 Members: ${participants.length}` }, { quoted: message });
            break;
        case 'admins':
            await sock.sendMessage(chatId, {
                text: `👑 Admins (${admins.length})\n${admins.map(p => `• @${participantNumber(p)}`).join('\n')}`,
                mentions: mentionJids(admins)
            }, { quoted: message });
            break;
        case 'nonadmins':
            await sock.sendMessage(chatId, {
                text: `👥 Non-admin members (${nonAdmins.length})\n${nonAdmins.slice(0, 80).map(p => `• @${participantNumber(p)}`).join('\n')}`,
                mentions: mentionJids(nonAdmins.slice(0, 80))
            }, { quoted: message });
            break;
        case 'mentionall':
            await sock.sendMessage(chatId, {                 text: commandArgs || '📢 Attention everyone!', mentions }, { quoted: message });
            break;
        case 'mentionadmins':
            await sock.sendMessage(chatId, {
                text: commandArgs || '📢 Message for admins.',
                mentions: mentionJids(admins)
            }, { quoted: message });
            break;
        case 'mentionnonadmins':
            await sock.sendMessage(chatId, {
                text: commandArgs || '📢 Message for members.',
                mentions: mentionJids(nonAdmins)
            }, { quoted: message });
            break;
        case 'groupstats':
            await sock.sendMessage(chatId, {
                text: `📊 Statistics\n• Members: ${participants.length}\n• Admins: ${admins.length}\n• Created: ${meta.creation ? new Date(meta.creation * 1000).toLocaleString('fr-FR') : 'unknown'}`
            }, { quoted: message });
            break;
        case 'groupcreated':
            await sock.sendMessage(chatId, {
                text: `📅 Group created on ${meta.creation ? new Date(meta.creation * 1000).toLocaleString('fr-FR') : 'date unavailable'}.`
            }, { quoted: message });
            break;
        case 'rules': {
            const state = readState();
            await sock.sendMessage(chatId, { text: state[chatId]?.rules || 'ℹ️ No rules configured. Use .setrules text.' }, { quoted: message });
            break;
        }
        case 'setrules': {
            if (!await requireAdmin(sock, chatId, message, owner)) break;
            if (!commandArgs) {
                await sock.sendMessage(chatId, { text: '❌ Use .setrules text.' }, { quoted: message });
                break;
            }
            const state = groupState(chatId);
            state[chatId].rules = commandArgs.slice(0, 3000);
            writeState(state);
            await sock.sendMessage(chatId, { text: '✅ Group rules updated.' }, { quoted: message });
            break;
        }
        case 'clearrules': {
            if (!await requireAdmin(sock, chatId, message, owner)) break;
            const state = groupState(chatId);
            delete state[chatId].rules;
            writeState(state);
            await sock.sendMessage(chatId, { text: '✅ Rules deleted.' }, { quoted: message });
            break;
        }
        case 'announce':
            if (!await requireAdmin(sock, chatId, message, owner)) break;
            await sock.sendMessage(chatId, { text: commandArgs || '📢 Group announcement.' }, { quoted: message });
            break;
        case 'grouplink':
            if (!await requireBotAdmin(sock, chatId, message, owner)) break;
            await sock.sendMessage(chatId, { text: `🔗 https://chat.whatsapp.com/${await sock.groupInviteCode(chatId)}` }, { quoted: message });
            break;
        case 'revokeinvite':
            if (!await requireBotAdmin(sock, chatId, message, owner)) break;
            await sock.groupRevokeInvite(chatId);
            await sock.sendMessage(chatId, { text: '✅ Group link revoked.' }, { quoted: message });
            break;
        case 'lockchat':
        case 'closechat':
            if (!await requireBotAdmin(sock, chatId, message, owner)) break;
            await sock.groupSettingUpdate(chatId, 'announcement');
            await sock.sendMessage(chatId, { text: '🔒 Group closed to members.' }, { quoted: message });
            break;
        case 'unlockchat':
        case 'openchat':
            if (!await requireBotAdmin(sock, chatId, message, owner)) break;
            await sock.groupSettingUpdate(chatId, 'not_announcement');
            await sock.sendMessage(chatId, { text: '🔓 Group open to members.' }, { quoted: message });
            break;
        case 'restrictchat':
            if (!await requireBotAdmin(sock, chatId, message, owner)) break;
            await sock.groupSettingUpdate(chatId, 'locked');
            await sock.sendMessage(chatId, { text: '🔐 Only admins can change group info.' }, { quoted: message });
            break;
        case 'unrestrictchat':
            if (!await requireBotAdmin(sock, chatId, message, owner)) break;
            await sock.groupSettingUpdate(chatId, 'unlocked');
            await sock.sendMessage(chatId, { text: '🔓 Members can change group info.' }, { quoted: message });
            break;
        case 'slowmode': {
            if (!await requireAdmin(sock, chatId, message, owner)) break;
            const seconds = Number(commandArgs);
            if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) {
                await sock.sendMessage(chatId, { text: '❌ Use .slowmode 0 to 3600. This configures the bot reminder.' }, { quoted: message });
                break;
            }
            const state = groupState(chatId);
            state[chatId].slowmode = seconds;
            writeState(state);
            await sock.sendMessage(chatId, { text: `✅ Slowmode set to ${seconds}s for the bot features.` }, { quoted: message });
            break;
        }
        case 'clearwarns': {
            if (!await requireAdmin(sock, chatId, message, owner)) break;
            const targets = getTargets(message);
            if (!targets.length) {
                await sock.sendMessage(chatId, { text: '❌ Mention or reply to a member.' }, { quoted: message });
                break;
            }
            const warningsFile = path.join(__dirname, '../data/warnings.json');
            let warnings = {};
            try { warnings = JSON.parse(fs.readFileSync(warningsFile, 'utf8')); } catch {}
            for (const jid of targets) delete warnings[`${chatId}_${jid}`];
            fs.writeFileSync(warningsFile, JSON.stringify(warnings, null, 2));
            await sock.sendMessage(chatId, { text: '✅ Warnings reset.', mentions: targets }, { quoted: message });
            break;
        }
        case 'promoteall':
        case 'demoteall': {
            if (!await requireBotAdmin(sock, chatId, message, owner)) break;
            const targets = command === 'promoteall' ? nonAdmins : admins.filter(p => !p.superadmin);
            const limited = targets.slice(0, 20);
            if (!limited.length) {
                await sock.sendMessage(chatId, { text: 'ℹ️ No member affected.' }, { quoted: message });
                break;
            }
            await sock.groupParticipantsUpdate(chatId, mentionJids(limited), command === 'promoteall' ? 'promote' : 'demote');
            await sock.sendMessage(chatId, { text: `✅ ${limited.length} member(s) processed.`, mentions: mentionJids(limited) }, { quoted: message });
            break;
        }
        case 'approveall': {
            if (!await requireBotAdmin(sock, chatId, message, owner)) break;
            if (typeof sock.groupRequestParticipantsList !== 'function' ||
                typeof sock.groupRequestParticipantsUpdate !== 'function') {
                await sock.sendMessage(chatId, {
                    text: '❌ This version of Baileys cannot process join requests.',
                    ...channelInfo
                }, { quoted: message });
                break;
            }

            let requests = [];
            try {
                requests = await sock.groupRequestParticipantsList(chatId) || [];
            } catch (error) {
                console.error('[approveall] unable to read requests:', error.message);
                await sock.sendMessage(chatId, {
                    text: '❌ Failed to read the group join requests.',
                    ...channelInfo
                }, { quoted: message });
                break;
            }

            const requestJids = requests
                .map(request => request.jid || request.id || request.phoneNumber)
                .filter(Boolean);
            if (!requestJids.length) {
                await sock.sendMessage(chatId, {
                    text: 'ℹ️ No pending join requests.',
                    ...channelInfo
                }, { quoted: message });
                break;
            }

            let approved = 0;
            for (let index = 0; index < requestJids.length; index += 50) {
                const batch = requestJids.slice(index, index + 50);
                try {
                    await sock.groupRequestParticipantsUpdate(chatId, batch, 'approve');
                    approved += batch.length;
                } catch (error) {
                    console.error('[approveall] unable to approve batch:', error.message);
                    for (const jid of batch) {
                        try {
                            await sock.groupRequestParticipantsUpdate(chatId, [jid], 'approve');
                            approved += 1;
                        } catch (individualError) {
                            console.error(`[approveall] request refused for ${jid}:`, individualError.message);
                        }
                    }
                }
            }
            await sock.sendMessage(chatId, {
                text: `✅ ${approved}/${requestJids.length} join request(s) approved.`,
                ...channelInfo
            }, { quoted: message });
            break;
        }
        case 'kickbots':
            await sock.sendMessage(chatId, { text: 'ℹ️ WhatsApp does not provide a reliable list of bots. Mention the accounts to remove with .kick to avoid accidental deletion.' }, { quoted: message });
            break;
        case 'poll': {
            if (!commandArgs.includes('|')) {
                await sock.sendMessage(chatId, { text: '❌ Use .poll Question | Option 1 | Option 2.' }, { quoted: message });
                break;
            }
            const [question, ...values] = commandArgs.split('|').map(value => value.trim()).filter(Boolean);
            if (values.length < 2) {
                await sock.sendMessage(chatId, { text: '❌ Add at least two options.' }, { quoted: message });
                break;
            }
            await sock.sendMessage(chatId, { poll: { name: question, values: values.slice(0, 12), selectableCount: 1 } });
            break;
        }
        case 'groupaudit':
            await sock.sendMessage(chatId, {
                text: `🔎 Audit\n• Name: ${meta.subject}\n• JID: ${chatId}\n• Members: ${participants.length}\n• Admins: ${admins.length}\n• Bot admin: ${admins.some(p => participantNumber(p) === participantNumber({ id: sock.user?.id })) ? 'yes' : 'no'}`
            }, { quoted: message });
            break;
        case 'groupmenu':
            await sock.sendMessage(chatId, {
                text: `📚 Group commands\n${GROUP_COMMANDS.map(name => `• .${name}`).join('\n')}`
            }, { quoted: message });
            break;
        default:
            break;
    }
    return true;
}

module.exports = { GROUP_COMMANDS, handleGroupExtraCommand };