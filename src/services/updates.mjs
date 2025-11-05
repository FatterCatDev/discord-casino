import { PermissionFlagsBits } from 'discord.js';
import { getGuildSettings } from '../db/db.auto.mjs';
import pkg from '../../package.json' with { type: 'json' };

export const BOT_VERSION = process.env.BOT_VERSION || pkg.version || '0.0.0';

function chunkMessageContent(content, limit = 2000) {
  const normalized = (content || '').replace(/\r\n/g, '\n');
  const chunks = [];
  let remaining = normalized.trim();

  while (remaining.length > limit) {
    const slice = remaining.slice(0, limit);
    let breakIdx = slice.lastIndexOf('\n\n');
    if (breakIdx === -1 || breakIdx < Math.floor(limit * 0.5)) breakIdx = slice.lastIndexOf('\n');
    if (breakIdx === -1 || breakIdx < Math.floor(limit * 0.5)) breakIdx = slice.lastIndexOf(' ');
    if (breakIdx === -1 || breakIdx < 1) breakIdx = limit;

    const chunk = remaining.slice(0, breakIdx).trimEnd();
    chunks.push(chunk);
    remaining = remaining.slice(breakIdx).trimStart();
  }

  if (remaining.length) {
    chunks.push(remaining);
  }

  return chunks;
}

export async function pushUpdateAnnouncement(
  client,
  guildId,
  { content, mentionEveryone = false, mentionRoleId = null } = {}
) {
  if (!client) throw new Error('UPDATE_PUSH_MISSING_CLIENT');
  if (!guildId) throw new Error('UPDATE_PUSH_MISSING_GUILD');
  if (!content || !content.trim()) throw new Error('UPDATE_PUSH_MISSING_CONTENT');

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

  const chunks = Array.isArray(content)
    ? content.flatMap(value => chunkMessageContent(String(value)))
    : chunkMessageContent(String(content));

  const normalizedRoleId = mentionRoleId ? String(mentionRoleId).trim() : null;
  if (normalizedRoleId && !/^\d{5,}$/.test(normalizedRoleId)) {
    throw new Error('UPDATE_PUSH_INVALID_ROLE_ID');
  }

  if (!chunks.length) throw new Error('UPDATE_PUSH_MISSING_CONTENT');

  const results = [];
  for (let idx = 0; idx < chunks.length; idx++) {
    const chunk = chunks[idx];
    const payload = {};
    if (idx === 0 && normalizedRoleId) {
      payload.content = `<@&${normalizedRoleId}>\n${chunk}`;
      payload.allowedMentions = { roles: [normalizedRoleId] };
    } else if (idx === 0 && mentionEveryone) {
      payload.content = `@everyone\n${chunk}`;
      payload.allowedMentions = { parse: ['everyone'] };
    } else {
      payload.content = chunk;
      payload.allowedMentions = { parse: [] };
    }
    // Ensure chunk is within Discord limit after mention prefix
    if (payload.content.length > 2000) {
      throw new Error('UPDATE_PUSH_CONTENT_TOO_LONG');
    }
    // eslint-disable-next-line no-await-in-loop
    const message = await channel.send(payload);
    results.push(message);
  }

  return results;
}
// Helper: push update embeds into the configured update channel
