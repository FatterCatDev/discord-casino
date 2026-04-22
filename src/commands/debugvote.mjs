import { recordTopggVote } from '../services/votes.mjs';

export default async function handleDebugVote(interaction, ctx) {
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
      content: say('❌ Only casino admins can simulate votes, Kitten.', '❌ Casino admin access required.'),
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

  try {
    const result = await recordTopggVote({
      user: target.id,
      type: 'upvote',
      bot: process.env.TOPGG_BOT_ID || process.env.CLIENT_ID || null,
      query: 'debugvote'
    });

    const amount = Number(result?.amount || 0);
    const rewardText = amount > 0 ? ctx.chipsAmount(amount) : `${amount.toLocaleString()} chips`;
    const statusLine = result?.recorded
      ? say('✅ Simulated Top.gg vote recorded successfully.', '✅ Simulated Top.gg vote recorded successfully.')
      : say('ℹ️ Simulated Top.gg vote was received but not recorded (likely duplicate vote id handling or vote settings).', 'ℹ️ Simulated Top.gg vote was received but not recorded (likely duplicate vote id handling or vote settings).');

    return interaction.reply({
      content: [
        statusLine,
        say(
          `Player: <@${target.id}> | Reward queued: **${rewardText}**`,
          `Player: <@${target.id}> | Reward queued: **${rewardText}**`
        )
      ].join('\n'),
      ephemeral: true
    });
  } catch (error) {
    if (error?.message === 'TOPGG_USER_REQUIRED') {
      return interaction.reply({
        content: say('⚠️ I could not find a valid player id for that simulation, Kitten.', '⚠️ Failed to simulate vote: missing player id.'),
        ephemeral: true
      });
    }
    console.error('[debugvote] failed to simulate top.gg vote', error);
    return interaction.reply({
      content: say('⚠️ I could not simulate that vote right now, Kitten.', '⚠️ Failed to simulate vote. Please try again soon.'),
      ephemeral: true
    });
  }
}