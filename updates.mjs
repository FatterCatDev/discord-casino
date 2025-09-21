import { PermissionFlagsBits } from 'discord.js';
import { getGuildSettings } from './db.auto.mjs';
import pkg from './package.json' with { type: 'json' };

export const BOT_VERSION = process.env.BOT_VERSION || pkg.version || '0.0.0';

export async function pushUpdateAnnouncement(client, guildId, { content, mentionEveryone = false } = {}) {
  if (!client) throw new Error('UPDATE_PUSH_MISSING_CLIENT');
  if (!guildId) throw new Error('UPDATE_PUSH_MISSING_GUILD');
  if (!content || !content.trim()) throw new Error('UPDATE_PUSH_MISSING_CONTENT');
  if (content.length > 2000) throw new Error('UPDATE_PUSH_CONTENT_TOO_LONG');

  const settings = await getGuildSettings(guildId);
  const channelId = settings?.update_channel_id;
  if (!channelId) throw new Error('UPDATE_CHANNEL_NOT_CONFIGURED');

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) throw new Error('UPDATE_PUSH_GUILD_NOT_FOUND');

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased?.()) throw new Error('UPDATE_PUSH_CHANNEL_UNAVAILABLE');

  const me = guild.members?.me || (await guild.members.fetchMe().catch(() => null));
  if (!me) throw new Error('UPDATE_PUSH_ME_NOT_FOUND');
  const perms = channel.permissionsFor(me);
  if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms?.has(PermissionFlagsBits.SendMessages)) {
    throw new Error('UPDATE_PUSH_MISSING_PERMISSIONS');
  }

  const payload = mentionEveryone
    ? { content: content, allowedMentions: { parse: ['everyone'] } }
    : { content };

  return channel.send(payload);
}
// Helper: push update embeds into the configured update channel
