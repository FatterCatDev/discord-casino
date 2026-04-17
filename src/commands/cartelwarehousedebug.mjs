import { addCartelWarehouseDebug, CartelError, formatSemuta } from '../cartel/service.mjs';

function formatMention(user) {
  if (!user?.id) return 'you';
  return `<@${user.id}>`;
}

export default async function handleCartelWarehouseDebug(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);

  if (!interaction.guild?.id) {
    return interaction.reply({ content: say('❌ I can only adjust warehouse Semuta inside a server, Kitten.', '❌ This command must be used inside a server.'), ephemeral: true });
  }
  if (!(await ctx.isAdmin(interaction))) {
    return interaction.reply({ content: say('❌ Only my trusted admins can run warehouse debug boosts, Kitten.', '❌ Casino admin access required.'), ephemeral: true });
  }

  const grams = interaction.options.getNumber('grams', true);

  try {
    const result = await addCartelWarehouseDebug(interaction.guild.id, interaction.user.id, grams);
    const added = formatSemuta(result.addedMg, { maximumFractionDigits: 2 });
    const before = formatSemuta(result.beforeWarehouseMg, { maximumFractionDigits: 2 });
    const after = formatSemuta(result.afterWarehouseMg, { maximumFractionDigits: 2 });
    const content = say(
      `✅ Added **${added}g** of Semuta to ${formatMention(interaction.user)}'s warehouse. It moved from **${before}g** to **${after}g**, Kitten.`,
      `✅ Added **${added}g** of Semuta to your warehouse. Before: **${before}g**. After: **${after}g**.`
    );
    return interaction.reply({ content, ephemeral: true });
  } catch (error) {
    if (error instanceof CartelError) {
      return interaction.reply({ content: `⚠️ ${error.message || 'Failed to add warehouse Semuta.'}`, ephemeral: true });
    }
    console.error('[cartelwarehousedebug] failed to add warehouse semuta', error);
    return interaction.reply({
      content: say('⚠️ I could not add that warehouse Semuta right now, Kitten.', '⚠️ Failed to add warehouse Semuta. Please try again soon.'),
      ephemeral: true
    });
  }
}
