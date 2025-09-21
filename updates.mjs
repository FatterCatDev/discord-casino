import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getGuildSettings } from './db.auto.mjs';
import pkg from './package.json' with { type: 'json' };

export const BOT_VERSION = process.env.BOT_VERSION || pkg.version || '0.0.0';

function chunkLines(lines, limit = 1024) {
  const chunks = [];
  let current = '';
  for (const line of lines) {
    const piece = line.length > limit
      ? line.slice(0, limit - 1) + '…'
      : line;
    if (!current) {
      current = piece;
      continue;
    }
    if ((current.length + 1 + piece.length) <= limit) {
      current += `\n${piece}`;
    } else {
      chunks.push(current);
      current = piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function formatSection(items) {
  if (!items) return [];

  const normalize = (value) => {
    const str = typeof value === 'string' ? value.trim() : String(value || '').trim();
    if (!str) return null;
    if (str.startsWith('•')) return str;
    if (str.startsWith('-') || str.startsWith('*')) {
      return `• ${str.replace(/^[-*]\s*/, '')}`;
    }
    return `• ${str}`;
  };

  let lines = [];
  if (Array.isArray(items)) {
    lines = items.map(normalize).filter(Boolean);
  } else {
    const str = normalize(items);
    if (!str) return [];
    const splitted = str.includes('\n') ? str.split('\n') : [str];
    lines = splitted.map(normalize).filter(Boolean);
  }

  return chunkLines(lines);
}

export async function pushUpdateAnnouncement(client, guildId, { changes, fixes, version = BOT_VERSION, notes, mentionEveryone = true } = {}) {
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

  const changeBlocks = formatSection(changes);
  changeBlocks.forEach((block, index) => {
    embed.addFields({ name: index === 0 ? 'What\'s New' : 'What\'s New (cont.)', value: block });
  });

  const fixesBlocks = formatSection(fixes);
  fixesBlocks.forEach((block, index) => {
    embed.addFields({ name: index === 0 ? 'Fixes' : 'Fixes (cont.)', value: block });
  });

  const notesBlocks = formatSection(notes);
  notesBlocks.forEach((block, index) => {
    embed.addFields({ name: index === 0 ? 'Notes' : 'Notes (cont.)', value: block });
  });

  if (!changeBlocks.length && !fixesBlocks.length && !notesBlocks.length) {
    embed.setDescription('No additional details were provided for this release.');
  }

  const payload = { embeds: [embed] };
  if (mentionEveryone) {
    payload.content = '@everyone';
    payload.allowedMentions = { parse: ['everyone'] };
  }

  try {
    return await channel.send(payload);
  } catch (err) {
    const missingEveryonePermission = err?.code === 50013 || err?.status === 403;
    if (mentionEveryone && missingEveryonePermission) {
      try {
        console.warn(`Missing permission to @everyone in guild ${guildId}; sending embed without mention.`);
        return await channel.send({ embeds: [embed] });
      } catch (fallbackError) {
        fallbackError.cause = err;
        throw fallbackError;
      }
    }
    throw err;
  }
}
// Helper: push update embeds into the configured update channel
