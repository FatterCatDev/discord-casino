import { Events, AuditLogEvent, PermissionFlagsBits } from 'discord.js';
import { getGuildSettingsCached } from './caches.mjs';
import { GUILD_WELCOME_WINDOW_MS, sendGuildWelcomeDm } from './guild-welcome.mjs';

export function registerGuildEvents(client, pushBotStatusSnapshot, triggerTopggStats, triggerDiscordForgeStats) {
  const listeners = new Map();
  function on(event, handler) {
    listeners.set(event, handler);
    client.on(event, handler);
  }
  on(Events.GuildCreate, async (guild) => {
    try {
      const joinedTimestamp = Number(
        guild?.joinedTimestamp ??
        guild?.members?.me?.joinedTimestamp ??
        guild?.joinedAt?.getTime?.()
      );
      if (Number.isFinite(joinedTimestamp)) {
        const age = Date.now() - joinedTimestamp;
        if (age > GUILD_WELCOME_WINDOW_MS) return;
      }
      await sendGuildWelcomeDm(guild, { source: 'guildCreate' });
    } catch (err) {
      console.error(`Failed to process guildCreate welcome for guild ${guild?.id}`, err);
    }
    pushBotStatusSnapshot('guild_create').catch(() => {});
    triggerTopggStats('guild_create');
    triggerDiscordForgeStats('guild_create');
  });

  on(Events.GuildDelete, (guild) => {
    pushBotStatusSnapshot('guild_delete').catch(() => {});
    triggerTopggStats('guild_delete');
    triggerDiscordForgeStats('guild_delete');
  });

  on(Events.GuildAuditLogEntryCreate, async (entry, guild) => {
    try {
      if (!guild || !entry || entry.action !== AuditLogEvent.BotAdd) return;
      if (entry.target?.id !== guild.client?.user?.id) return;
      const executor = entry.executor
        ? await guild.client.users.fetch(entry.executor.id).catch(() => entry.executor)
        : null;
      await sendGuildWelcomeDm(guild, { inviter: executor, source: 'auditLog' });
    } catch (err) {
      console.error(`Failed to process audit log welcome for guild ${guild?.id}`, err);
    }
  });

  on(Events.MessageCreate, async (message) => {
    try {
      if (!message?.guild || !message?.author || message.author.bot) return;

      const guildId = message.guild.id;
      const settings = await getGuildSettingsCached(guildId);
      const autoBanChannelId = settings?.auto_ban_channel_id || null;
      if (!autoBanChannelId || message.channelId !== autoBanChannelId) return;

      const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
      if (!member) return;
      if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return;

      const me = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
      if (!me?.permissions?.has?.(PermissionFlagsBits.BanMembers)) {
        console.warn(`Auto-ban skipped in guild ${guildId}: bot lacks Ban Members permission.`);
        return;
      }

      if (!member.bannable) {
        console.warn(`Auto-ban skipped in guild ${guildId}: user ${member.id} is not bannable.`);
        return;
      }

      await member.ban({
        deleteMessageSeconds: 24 * 60 * 60,
        reason: `Auto-ban channel violation in #${message.channel?.name || message.channelId}`
      });
      console.log(`Auto-banned user ${member.id} in guild ${guildId} for posting in configured auto-ban channel ${autoBanChannelId}.`);
    } catch (err) {
      console.error('Auto-ban enforcement failed:', err);
    }
  });
  return () => {
    for (const [event, handler] of listeners) client.off(event, handler);
    listeners.clear();
  };
}
