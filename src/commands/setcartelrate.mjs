import { updateCartelShareRate, formatSemuta } from '../cartel/service.mjs';

export default async function handleSetCartelRate(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);

  if (!interaction.guild?.id) {
    return interaction.reply({ content: say('❌ I can only tune cartel output inside a server, Kitten.', '❌ This command must be used inside a server.'), ephemeral: true });
  }
  if (!(await ctx.isAdmin(interaction))) {
    return interaction.reply({ content: say('❌ Only my trusted admins may touch the Semuta flow, Kitten.', '❌ Casino admin access required.'), ephemeral: true });
  }

  const grams = interaction.options.getNumber('grams');
  if (!Number.isFinite(grams) || grams <= 0) {
    return interaction.reply({ content: say('❌ Whisper a positive grams-per-hour value, Kitten.', '❌ Enter a positive grams-per-hour value.'), ephemeral: true });
  }

  try {
    const { shareRateMgPerHour } = await updateCartelShareRate(interaction.guild.id, grams);
    const pretty = formatSemuta(shareRateMgPerHour, { maximumFractionDigits: 3 });
    const content = say(
      `✅ Each share now yields **${pretty}g/hr** of Semuta, Kitten.`,
      `✅ Cartel share rate set to **${pretty} g/hr** per share.`
    );
    return interaction.reply({ content, ephemeral: true });
  } catch (error) {
    console.error('[setcartelrate] failed to update share rate', error);
    return interaction.reply({ content: say('⚠️ I couldn’t set that rate right now, Kitten.', '⚠️ Failed to update the cartel share rate. Please try again soon.'), ephemeral: true });
  }
}
