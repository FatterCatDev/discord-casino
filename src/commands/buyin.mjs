import { mintChips } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';

export default async function handleBuyIn(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  if (!(await ctx.isModerator(interaction))) {
    return interaction.reply({ content: say('❌ Only my trusted staff may mint chips for another Kitten.', '❌ You do not have permission.'), ephemeral: true });
  }
  const target = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');
  const reason = interaction.options.getString('reason') || null;
  if (!Number.isInteger(amount) || amount <= 0) {
    return interaction.reply({ content: say('❌ Offer me a positive amount, Kitten.', 'Amount must be a positive integer.'), ephemeral: true });
  }
  try {
    const { chips } = await mintChips(interaction.guild?.id, target.id, amount, reason, interaction.user.id);
    const logLines = kittenMode
      ? [
          `${emoji('coin')} **Buy-in**`,
          `User: My eager Kitten <@${target.id}> • Amount: **${ctx.chipsAmount(amount)}**${reason ? ` • Reason: ${reason}` : ''}`,
          `User Chips (after): **${ctx.chipsAmount(chips)}**`
        ]
      : [
          `${emoji('coin')} **Buy-in**`,
          `User: <@${target.id}> • Amount: **${ctx.chipsAmount(amount)}**${reason ? ` • Reason: ${reason}` : ''}`,
          `User Chips (after): **${ctx.chipsAmount(chips)}**`
        ];
    await ctx.postCashLog(interaction, logLines);
    try {
      const dm = say(
        `${emoji('coin')} Buy-in: Drink it in, Kitten <@${target.id}> — your chips drip with my affection.`,
        `${emoji('coin')} Buy-in: You received ${ctx.chipsAmount(amount)}. Processed by ${interaction.user.tag}.`
      );
      await target.send(dm);
    } catch {}
    return interaction.reply({
      content: say(
        `✅ Minted **${ctx.chipsAmount(amount)}** for my luxuriant Kitten <@${target.id}>${reason ? ` (${reason})` : ''}.\n• Indulge yourself, Kitten — balance now **${ctx.chipsAmount(chips)}**`,
        `✅ Minted **${ctx.chipsAmount(amount)}** to <@${target.id}>${reason ? ` (${reason})` : ''}.\n• New balance: **${ctx.chipsAmount(chips)}**`
      ),
      ephemeral: true
    });
  } catch (e) {
    console.error(e);
    return interaction.reply({ content: say('❌ Something went wrong with that mint, Kitten. Try again in a moment.', '❌ Something went wrong.'), ephemeral: true });
  }
}
