import { getLastDailySpinAt, setLastDailySpinNow } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';
import { formatCooldown, getDailySpinRemaining } from './dailyspin.mjs';

export default async function handleDebugDailySpin(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);

  if (!interaction.guild?.id) {
    return interaction.reply({
      content: say('❌ This can only be used inside a server, Kitten.', '❌ This command must be used inside a server.'),
      ephemeral: true
    });
  }

  if (!(await ctx.isAdmin(interaction))) {
    return interaction.reply({
      content: say('❌ Only casino admins can reset daily spin cooldowns, Kitten.', '❌ Casino admin access required.'),
      ephemeral: true
    });
  }

  const target = interaction.options.getUser('player');
  if (!target) {
    return interaction.reply({
      content: say('❌ Pick a player first, Kitten.', '❌ Please choose a player.'),
      ephemeral: true
    });
  }

  const guildId = interaction.guild.id;
  const now = Math.floor(Date.now() / 1000);

  try {
    const before = await getLastDailySpinAt(guildId, target.id);
    const beforeRemaining = getDailySpinRemaining(now, before);

    // Backdate by one full cooldown window so the player can spin immediately.
    await setLastDailySpinNow(guildId, target.id, now - (24 * 60 * 60));

    const after = await getLastDailySpinAt(guildId, target.id);
    const afterRemaining = getDailySpinRemaining(now, after);

    return interaction.reply({
      content: [
        `${emoji('gear')} ${say('Daily spin cooldown reset complete, Kitten.', 'Daily spin cooldown reset complete.')}`,
        `Player: <@${target.id}>`,
        `${say('Before:', 'Before:')} ${beforeRemaining > 0 ? `**${formatCooldown(beforeRemaining)}** remaining` : '**ready**'}`,
        `${say('After:', 'After:')} ${afterRemaining > 0 ? `**${formatCooldown(afterRemaining)}** remaining` : '**ready**'}`
      ].join('\n'),
      ephemeral: true
    });
  } catch (error) {
    console.error('[debugdspin] failed to reset cooldown', error);
    return interaction.reply({
      content: say('⚠️ I could not reset that daily spin cooldown right now, Kitten.', '⚠️ Failed to reset daily spin cooldown. Please try again soon.'),
      ephemeral: true
    });
  }
}
