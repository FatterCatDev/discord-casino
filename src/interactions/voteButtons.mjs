import { buildVoteResponse } from '../commands/vote.mjs';
import { getVoteSites, getVoteSummary, claimVoteRewards, describeBreakdown } from '../services/votes.mjs';

export default async function handleVoteButtons(interaction, ctx) {
  const [ns, action] = String(interaction.customId || '').split('|');
  if (ns !== 'vote' || action !== 'claim') {
    if (interaction.deferred || interaction.replied) {
      return interaction.followUp({ content: '❌ Unknown vote action.', ephemeral: true });
    }
    return interaction.reply({ content: '❌ Unknown vote action.', ephemeral: true });
  }

  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const userId = interaction.user?.id;
  if (!userId) {
    const msg = say('❌ I cannot see which Kitten tapped the button.', '❌ Unable to identify you.');
    if (interaction.deferred || interaction.replied) {
      return interaction.followUp({ content: msg, ephemeral: true });
    }
    return interaction.reply({ content: msg, ephemeral: true });
  }

  const guildId = interaction.guild?.id || null;
  try {
    const result = await claimVoteRewards(guildId, userId);
    const summary = await getVoteSummary(userId);
    const sites = getVoteSites();

    let status;
    if (result?.claimedCount > 0 && result?.claimedTotal > 0) {
      const breakdown = describeBreakdown(result.breakdown || []);
      const balance = ctx.chipsAmount(result?.balances?.chips || 0);
      status = say(
        `🎉 Claimed **${ctx.chipsAmount(result.claimedTotal)}** from ${breakdown || 'your latest votes'}! Your new balance: **${balance}**.`,
        `🎉 Claimed **${ctx.chipsAmount(result.claimedTotal)}** from ${breakdown || 'your latest votes'}! New balance: **${balance}**.`
      );
    } else {
      status = say(
        '❌ No treats were ready to claim yet. Vote first, then come back to me.',
        '❌ No vote rewards are ready to claim yet. Vote first, then come back to claim.'
      );
    }

    const payload = buildVoteResponse({ ctx, kittenMode, summary, sites, statusMessage: status });
    const updatePayload = { ...payload };
    if (!payload.content) delete updatePayload.content;
    await interaction.update(updatePayload);
  } catch (err) {
    console.error('[vote] failed to claim rewards:', err);
    const msg = say('❌ Something went wrong while claiming your treats, Kitten.', '❌ Something went wrong while claiming your vote rewards.');
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: msg, ephemeral: true });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
}

