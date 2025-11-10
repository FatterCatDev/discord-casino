import { getCartelOverview, resetCartelPlayer, formatSemuta } from '../cartel/service.mjs';

function formatUserMention(user) {
  if (!user) return 'that player';
  return `<@${user.id}>`;
}

function formatGrams(mg) {
  const grams = formatSemuta(mg, { maximumFractionDigits: 2 });
  return `${grams}g`;
}

export default async function handleCartelReset(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);

  if (!interaction.guild?.id) {
    return interaction.reply({ content: say('❌ I can only reset a cartel inside a server, Kitten.', '❌ This command must be used inside a server.'), ephemeral: true });
  }
  if (!(await ctx.isAdmin(interaction))) {
    return interaction.reply({ content: say('❌ Only my trusted admins may wipe a cartel slate, Kitten.', '❌ Casino admin access required.'), ephemeral: true });
  }

  const target = interaction.options.getUser('user');
  if (!target) {
    return interaction.reply({ content: say('❌ Choose a player for me to reset, Kitten.', '❌ Please choose a player to reset.'), ephemeral: true });
  }

  let beforeState = null;
  try {
    beforeState = await getCartelOverview(interaction.guild.id, target.id);
  } catch (err) {
    console.warn('[cartelreset] failed to load pre-reset overview', err);
  }
  const beforeInvestor = beforeState?.investor;
  const sharesBefore = Number(beforeInvestor?.shares || 0);
  const stashBefore = Number(beforeInvestor?.stash_mg || 0);
  const warehouseBefore = Number(beforeInvestor?.warehouse_mg || 0);

  try {
    await resetCartelPlayer(interaction.guild.id, target.id);
  } catch (error) {
    console.error('[cartelreset] failed to reset cartel player', error);
    return interaction.reply({
      content: say('⚠️ I couldn’t reset that cartel profile right now, Kitten.', '⚠️ Failed to reset that cartel profile. Please try again soon.'),
      ephemeral: true
    });
  }

  const shareLine = sharesBefore > 0
    ? `${sharesBefore.toLocaleString('en-US')} shares`
    : 'no shares';
  const stashLine = stashBefore > 0
    ? `${formatGrams(stashBefore)} stash`
    : 'an empty stash';
  const warehouseLine = warehouseBefore > 0
    ? `${formatGrams(warehouseBefore)} warehouse`
    : 'an empty warehouse';

  const mention = formatUserMention(target);
  const content = say(
    `✅ ${mention} is back to square one — ${shareLine}, ${stashLine}, ${warehouseLine}. All dealers are gone, Kitten.`,
    `✅ Reset ${mention}'s cartel profile: removed ${shareLine}, cleared ${stashLine}, and ${warehouseLine}. Dealers were deleted and rank reset to 1.`
  );
  return interaction.reply({ content, ephemeral: true });
}
