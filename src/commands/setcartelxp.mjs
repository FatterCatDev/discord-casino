import { updateCartelXpPerGram } from '../cartel/service.mjs';

export default async function handleSetCartelXp(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);

  if (!interaction.guild?.id) {
    return interaction.reply({ content: say('❌ I can only tune XP inside a server, Kitten.', '❌ This command must be used inside a server.'), ephemeral: true });
  }
  if (!(await ctx.isAdmin(interaction))) {
    return interaction.reply({ content: say('❌ Only my trusted admins may tweak XP payouts, Kitten.', '❌ Casino admin access required.'), ephemeral: true });
  }

  const xp = interaction.options.getNumber('xp');
  if (xp === null || xp === undefined || !Number.isFinite(xp) || xp < 0) {
    return interaction.reply({ content: say('❌ Give me a non-negative XP value per gram, Kitten.', '❌ Enter a non-negative XP per gram value.'), ephemeral: true });
  }

  try {
    const { xpPerGram } = await updateCartelXpPerGram(interaction.guild.id, xp);
    const formatted = Number(xpPerGram || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
    return interaction.reply({ content: say(`✅ XP per gram sold is now **${formatted}**.`, `✅ Cartel XP per gram sold set to **${formatted}**.`), ephemeral: true });
  } catch (error) {
    console.error('[setcartelxp] failed to update XP rate', error);
    return interaction.reply({ content: say('⚠️ I couldn’t update that XP rate, Kitten.', '⚠️ Failed to update the cartel XP rate. Please try again soon.'), ephemeral: true });
  }
}
