import { mintChips, getLastDailySpinAt, setLastDailySpinNow } from '../db.auto.mjs';

const SECONDS_PER_DAY = 24 * 60 * 60;

const REWARDS = [
  { chance: 0.50, amount: 50 },
  { chance: 0.25, amount: 80 },
  { chance: 0.15, amount: 120 },
  { chance: 0.07, amount: 200 },
  { chance: 0.03, amount: 500 }
];

function chooseReward() {
  const roll = Math.random();
  let cumulative = 0;
  for (const bucket of REWARDS) {
    cumulative += bucket.chance;
    if (roll < cumulative) return bucket.amount;
  }
  return REWARDS[REWARDS.length - 1].amount;
}

function formatCooldown(seconds) {
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
  const remaining = SECONDS_PER_DAY - (now - last);
  if (last && remaining > 0) {
    return interaction.reply({
      content: say(
        `⏳ Patience, Kitten. Come back in **${formatCooldown(remaining)}** for another spin.`,
        `⏳ You can spin again in **${formatCooldown(remaining)}**.`
      ),
      ephemeral: true
    });
  }

  const reward = chooseReward();
  const { chips } = await mintChips(guildId, userId, reward, 'daily wheel spin', interaction.client?.user?.id || null);
  await setLastDailySpinNow(guildId, userId, now);

  return interaction.reply({
    content: say(
      `🎡 The wheel stops on **${ctx.chipsAmount(reward)}**! Enjoy your winnings, Kitten.\nYour new chip stash: **${ctx.chipsAmount(chips)}**.`,
      `🎡 You won **${ctx.chipsAmount(reward)}**! Your new balance is **${ctx.chipsAmount(chips)}**.`
    ),
    ephemeral: true
  });
}
