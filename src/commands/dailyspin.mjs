import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getLastDailySpinAt } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';

const SECONDS_PER_DAY = 24 * 60 * 60;

const REWARDS = [
  { chance: 0.50, amount: 2000 },
  { chance: 0.25, amount: 3200 },
  { chance: 0.15, amount: 4800 },
  { chance: 0.07, amount: 8000 },
  { chance: 0.03, amount: 20000 }
];

export function chooseReward() {
  const roll = Math.random();
  let cumulative = 0;
  for (const bucket of REWARDS) {
    cumulative += bucket.chance;
    if (roll < cumulative) return bucket.amount;
  }
  return REWARDS[REWARDS.length - 1].amount;
}

export function formatCooldown(seconds) {
  if (seconds <= 0) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const parts = [];
  if (hrs) parts.push(`${hrs}h`);
  if (mins) parts.push(`${mins}m`);
  if (secs || !parts.length) parts.push(`${secs}s`);
  return parts.join(' ');
}

export function getDailySpinRemaining(now, last) {
  if (!last) return 0;
  const remaining = SECONDS_PER_DAY - (now - last);
  return remaining > 0 ? remaining : 0;
}

export function buildDailySpinPromptPayload(ctx, {
  userId,
  kittenMode = false,
  remainingSeconds = 0
} = {}) {
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const rewardLines = REWARDS
    .map(bucket => `• **${ctx.chipsAmount(bucket.amount)}** — ${(bucket.chance * 100).toFixed(0)}%`)
    .join('\n');
  const ready = remainingSeconds <= 0;

  const embed = new EmbedBuilder()
    .setTitle(`${emoji('roulette')} ${say('Daily Spin, Kitten', 'Daily Spin')}`)
    .setColor(ready ? 0x57F287 : 0xFEE75C)
    .setDescription(say(
      'Spin the wheel once every 24 hours for a free chip reward.',
      'Spin once every 24 hours for free chips.'
    ))
    .addFields(
      { name: say('Reward Tiers', 'Reward Tiers'), value: rewardLines },
      {
        name: say('Status', 'Status'),
        value: ready
          ? say('✅ Ready to spin now.', '✅ Ready now.')
          : say(`${emoji('hourglass')} Cooldown active: **${formatCooldown(remainingSeconds)}** remaining.`, `${emoji('hourglass')} Cooldown active: **${formatCooldown(remainingSeconds)}** remaining.`)
      }
    );

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dailyspin|confirm|${userId || 'unknown'}`)
      .setLabel(ready ? 'Confirm Spin' : 'On Cooldown')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!ready)
  );

  return {
    embeds: [embed],
    components: [row],
    ephemeral: true
  };
}

export default async function handleDailySpin(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);

  const guildId = interaction.guild?.id || null;
  const userId = interaction.user?.id;
  if (!userId) {
    return interaction.reply({ content: say('❌ I need to know which Kitten is spinning the wheel.', '❌ Unable to identify you.'), ephemeral: true });
  }

  const now = Math.floor(Date.now() / 1000);
  const last = await getLastDailySpinAt(guildId, userId);
  const remaining = getDailySpinRemaining(now, last);
  return interaction.reply(buildDailySpinPromptPayload(ctx, { userId, kittenMode, remainingSeconds: remaining }));
}

export { REWARDS };
