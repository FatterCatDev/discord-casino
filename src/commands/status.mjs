import { emoji } from '../lib/emojis.mjs';
import { getGlobalPlayerCount } from '../db/db.auto.mjs';
import { BOT_VERSION } from '../services/updates.mjs';

const STATUS_LABELS = {
  0: 'Ready',
  1: 'Connecting',
  2: 'Reconnecting',
  3: 'Idle',
  4: 'Nearly',
  5: 'Disconnected',
  6: 'Waiting for Guilds',
  7: 'Identifying',
  8: 'Resuming'
};

function formatNumber(value) {
  if (!Number.isFinite(value)) return '0';
  return value.toLocaleString();
}

function gatewayStatusLabel(code) {
  if (code === null || code === undefined) return 'Unknown';
  return STATUS_LABELS[code] || `Unknown (${code})`;
}

export default async function handleStatus(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);

  const version = interaction.client?.botVersion || BOT_VERSION || '0.0.0';
  const statusCode = interaction.client?.ws?.status;
  const ping = Number.isFinite(interaction.client?.ws?.ping) ? Math.round(interaction.client.ws.ping) : null;
  const playerCount = await getGlobalPlayerCount();
  const guildCount = interaction.client?.guilds?.cache?.size ?? 0;

  const lines = [
    `${emoji('robot')} ${say('Current build', 'Version')}: **${version}**`,
    `${emoji('trafficLight')} ${say('Link status', 'Gateway status')}: **${gatewayStatusLabel(statusCode)}${ping !== null ? ` — ${ping}ms` : ''}**`,
    `${emoji('busts')} ${say('Total kittens indulged', 'Global players tracked')}: **${formatNumber(playerCount)}**`,
    `${emoji('globe')} ${say('Servers I lounge in', 'Servers installed')}: **${formatNumber(guildCount)}**`
  ];

  return interaction.reply({
    content: lines.join('\n'),
    ephemeral: true
  });
}
