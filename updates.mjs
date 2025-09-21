import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildSettings } from './db.auto.mjs';
import pkg from './package.json' assert { type: 'json' };

export const BOT_VERSION = process.env.BOT_VERSION || pkg.version || '0.0.0';

function formatSection(items) {
  if (!items) return null;
  if (Array.isArray(items)) {
    const lines = items
      .map(item => (typeof item === 'string' ? item.trim() : String(item || '').trim()))
      .filter(Boolean);
    if (!lines.length) return null;
    return lines.map(line => `• ${line}`).join('\n');
  }
  const str = typeof items === 'string' ? items.trim() : String(items || '').trim();
  if (!str) return null;
  const hasLineBreaks = str.includes('\n');
  if (hasLineBreaks) {
    return str
      .split('\n')
      .map(part => part.trim())
      .filter(Boolean)
      .map(line => (line.startsWith('•') ? line : `• ${line}`))
      .join('\n');
  }
  return str.startsWith('•') ? str : `• ${str}`;
}

export async function pushUpdateAnnouncement(client, guildId, { changes, fixes, version = BOT_VERSION, notes } = {}) {
  if (!client) throw new Error('UPDATE_PUSH_MISSING_CLIENT');
  if (!guildId) throw new Error('UPDATE_PUSH_MISSING_GUILD');

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

  const embed = new EmbedBuilder()
    .setTitle(`Casino Bot Update v${version}`)
    .setColor(0x00AE86)
    .setTimestamp(new Date());

  const changeBlock = formatSection(changes);
  if (changeBlock) {
    embed.addFields({ name: 'What\'s New', value: changeBlock });
  }

  const fixesBlock = formatSection(fixes);
  if (fixesBlock) {
    embed.addFields({ name: 'Fixes', value: fixesBlock });
  }

  const notesBlock = formatSection(notes);
  if (notesBlock) {
    embed.addFields({ name: 'Notes', value: notesBlock });
  }

  if (!changeBlock && !fixesBlock && !notesBlock) {
    embed.setDescription('No additional details were provided for this release.');
  }

  return channel.send({ embeds: [embed] });
}
// Helper: push update embeds into the configured update channel
