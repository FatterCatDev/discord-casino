import { AuditLogEvent } from 'discord.js';

export const GUILD_WELCOME_WINDOW_MS = 5 * 60 * 1000;

const guildWelcomeSent = new Set();

const pendingGuildWelcome = new Set();

async function findBotInviter(guild) {
  if (!guild || !guild.client?.user) return null;
  try {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 5 });
    const entry = logs.entries.find(logEntry => logEntry.action === AuditLogEvent.BotAdd && logEntry.target?.id === guild.client.user.id);
    if (entry?.executor) {
      try {
        return await guild.client.users.fetch(entry.executor.id);
      } catch {
        return entry.executor;
      }
    }
  } catch (err) {
    console.warn(`Could not resolve bot inviter for guild ${guild?.id}`, err);
  }
  if (guild?.ownerId) {
    try {
      return await guild.client.users.fetch(guild.ownerId);
    } catch {
      return guild.client.users.resolve(guild.ownerId) || null;
    }
  }
  return null;
}

function buildGuildWelcomeMessage(inviter, guild) {
  const displayName = inviter?.globalName || inviter?.username || 'there';
  const guildName = guild?.name ? ` to ${guild.name}` : '';
  return [
    `Hey ${displayName}! Thanks for inviting Casino Bot${guildName}.`,
    '',
    'Casino Bot runs a single global economy shared across every server, so balances, jobs, and ledgers follow players everywhere.',
    '',
    'Quick setup checklist:',
    '1. Run `/setcasinocategory category:<#Category>` so all games live in a dedicated channel group.',
    '2. Confirm the bot can Send Messages, Embed Links, Manage Channels, Use External Emojis, and Read Message History in that category.',
    '3. (Optional) Point the log channels if you want detailed embeds elsewhere:',
    '   - `/setgamelogchannel channel:<#channel>` for game summaries',
    '   - `/setcashlog channel:<#channel>` for chip and cash ledger updates',
    '   - `/setrequestchannel channel:<#channel>` for buy-in and cash-out tickets',
    '   - `/setupdatech channel:<#channel>` for release announcements',
    '4. Moderator and admin access is managed by the development team to protect the shared economy—reach out if you need roster changes.',
    '5. Use `/help` any time for the full command list and extra guidance.',
    '',
    'Once those are set, your players can jump straight into `/slots`, `/blackjack`, `/roulette`, and more. Have fun!',
    '',
    'Need a hand or spot an issue? Hop into our support hub: https://discord.gg/semutaofdune'
  ].join('\n');
}

export async function sendGuildWelcomeDm(guild, { inviter, source } = {}) {
  if (!guild) return;
  if (guildWelcomeSent.has(guild.id) || pendingGuildWelcome.has(guild.id)) return;
  pendingGuildWelcome.add(guild.id);
  let resolvedInviter = inviter;
  if (!resolvedInviter) resolvedInviter = await findBotInviter(guild);
  if (!resolvedInviter) {
    console.warn(`Skipping welcome DM: no inviter found for guild ${guild?.id} (${source || 'unknown'})`);
    pendingGuildWelcome.delete(guild.id);
    return;
  }
  try {
    const message = buildGuildWelcomeMessage(resolvedInviter, guild);
    await resolvedInviter.send({ content: message });
    const identifier = resolvedInviter.tag || resolvedInviter.username || resolvedInviter.id;
    console.log(`Sent setup DM to ${identifier} for guild ${guild?.id} (${source || 'unknown'})`);
  } catch (err) {
    console.error(`Failed to send welcome DM for guild ${guild?.id} (${source || 'unknown'})`, err);
  }
  guildWelcomeSent.add(guild.id);
  pendingGuildWelcome.delete(guild.id);
}
