import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getLastDailySpinAt, mintChips, setLastDailySpinNow } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';
import {
  buildDailySpinPromptPayload,
  chooseReward,
  formatCooldown,
  getDailySpinRemaining,
  REWARDS
} from '../commands/dailyspin.mjs';

function buildClaimedRow(userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dailyspin|confirm|${userId || 'unknown'}`)
      .setLabel('Claimed')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
}

function buildResultPayload(ctx, {
  userId,
  kittenMode = false,
  reward,
  chips
} = {}) {
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const rewardLines = REWARDS
    .map(bucket => `• **${ctx.chipsAmount(bucket.amount)}** — ${(bucket.chance * 100).toFixed(0)}%`)
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`${emoji('roulette')} ${say('Daily Spin Result', 'Daily Spin Result')}`)
    .setColor(0x57F287)
    .setDescription(say(
      `The wheel stops on **${ctx.chipsAmount(reward)}**! Enjoy your winnings, Kitten.`,
      `You won **${ctx.chipsAmount(reward)}**.`
    ))
    .addFields(
      { name: say('Reward Tiers', 'Reward Tiers'), value: rewardLines },
      {
        name: say('Updated Balance', 'Updated Balance'),
        value: say(
          `Your new chip stash: **${ctx.chipsAmount(chips)}**.`,
          `Your new chip balance is **${ctx.chipsAmount(chips)}**.`
        )
      },
      {
        name: say('Next Spin', 'Next Spin'),
        value: say(
          `${emoji('hourglass')} Come back in **${formatCooldown(24 * 60 * 60)}**.`,
          `${emoji('hourglass')} Available again in **${formatCooldown(24 * 60 * 60)}**.`
        )
      }
    );

  return {
    embeds: [embed],
    components: [buildClaimedRow(userId)]
  };
}

export default async function onDailySpinButtons(interaction, ctx) {
  if (!interaction.isButton() || !interaction.customId.startsWith('dailyspin|')) {
    return interaction.reply({ content: '❌ Unknown action.', ephemeral: true });
  }

  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);

  const parts = interaction.customId.split('|');
  const action = parts[1];
  const ownerId = parts[2];
  const userId = interaction.user?.id;
  const guildId = interaction.guild?.id || null;

  if (!userId) {
    return interaction.reply({ content: say('❌ I cannot identify you, Kitten.', '❌ Unable to identify you.'), ephemeral: true });
  }

  if (ownerId && ownerId !== userId) {
    return interaction.reply({
      content: say('❌ That spin belongs to another Kitten.', '❌ This spin prompt belongs to another player.'),
      ephemeral: true
    });
  }

  if (action !== 'confirm') {
    return interaction.reply({ content: '❌ Unknown action.', ephemeral: true });
  }

  const now = Math.floor(Date.now() / 1000);
  const last = await getLastDailySpinAt(guildId, userId);
  const remaining = getDailySpinRemaining(now, last);

  if (remaining > 0) {
    const payload = buildDailySpinPromptPayload(ctx, {
      userId,
      kittenMode,
      remainingSeconds: remaining
    });
    if (typeof interaction.update === 'function') {
      return interaction.update({ embeds: payload.embeds, components: payload.components });
    }
    return interaction.reply({
      content: say(
        `${emoji('hourglass')} Patience, Kitten. Come back in **${formatCooldown(remaining)}** for another spin.`,
        `${emoji('hourglass')} You can spin again in **${formatCooldown(remaining)}**.`
      ),
      ephemeral: true
    });
  }

  const reward = chooseReward();
  const { chips } = await mintChips(guildId, userId, reward, 'daily wheel spin', interaction.client?.user?.id || null);
  await setLastDailySpinNow(guildId, userId, now);

  const resultPayload = buildResultPayload(ctx, { userId, kittenMode, reward, chips });
  if (typeof interaction.update === 'function') {
    return interaction.update(resultPayload);
  }
  return interaction.reply({
    content: say(
      `${emoji('roulette')} The wheel stops on **${ctx.chipsAmount(reward)}**! Enjoy your winnings, Kitten.\nYour new chip stash: **${ctx.chipsAmount(chips)}**.`,
      `${emoji('roulette')} You won **${ctx.chipsAmount(reward)}**! Your new balance is **${ctx.chipsAmount(chips)}**.`
    ),
    ephemeral: true
  });
}
