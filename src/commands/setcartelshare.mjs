import { getCartelSharePrice, updateCartelSharePrice } from '../cartel/service.mjs';

function formatChipsLine(ctx, amount) {
  if (typeof ctx?.chipsAmount === 'function') {
    return ctx.chipsAmount(amount);
  }
  const value = Math.floor(Number(amount || 0));
  return `${value.toLocaleString('en-US')} chips`;
}

export default async function handleSetCartelShare(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);

  if (!interaction.guild?.id) {
    return interaction.reply({ content: say('❌ I can only tune cartel settings inside a server, Kitten.', '❌ This command must be used inside a server.'), ephemeral: true });
  }
  if (!(await ctx.isAdmin(interaction))) {
    return interaction.reply({ content: say('❌ Only my trusted admins may set cartel prices, Kitten.', '❌ Casino admin access required.'), ephemeral: true });
  }

  const rawPrice = interaction.options.getInteger('price');
  if (!Number.isInteger(rawPrice) || rawPrice <= 0) {
    return interaction.reply({ content: say('❌ Whisper a positive price if you want me to change it, Kitten.', '❌ Enter a positive whole-number price in chips.'), ephemeral: true });
  }

  const desiredPrice = Math.min(Math.floor(rawPrice), 1_000_000_000);
  let previousPrice = null;
  try {
    previousPrice = await getCartelSharePrice(interaction.guild.id);
  } catch (err) {
    console.warn('[setcartelshare] failed to read existing share price', err);
  }

  try {
    const { sharePrice } = await updateCartelSharePrice(interaction.guild.id, desiredPrice);
    const nextLabel = formatChipsLine(ctx, sharePrice);
    const prevLabel = previousPrice != null ? formatChipsLine(ctx, previousPrice) : null;
    const changedNote = prevLabel && previousPrice !== sharePrice
      ? say(` (was ${prevLabel})`, ` (was ${prevLabel})`)
      : '';
    const content = say(
      `✅ Cartel shares now cost **${nextLabel}**${changedNote}.`,
      `✅ Cartel share price set to **${nextLabel}**${changedNote}.`
    );
    return interaction.reply({ content, ephemeral: true });
  } catch (error) {
    console.error('[setcartelshare] failed to update price', error);
    return interaction.reply({
      content: say('⚠️ I couldn’t update the cartel price right now, Kitten. Try again shortly.', '⚠️ Failed to update the cartel share price. Please try again soon.'),
      ephemeral: true
    });
  }
}
