import { burnFromUser } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';

export default async function handleCashOut(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  if (!(await ctx.isModerator(interaction))) {
    return interaction.reply({ content: say('❌ Only my trusted staff may handle cash outs for another Kitten.', '❌ You do not have permission.'), ephemeral: true });
  }
  const target = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');
  const reason = interaction.options.getString('reason') || null;
  if (!Number.isInteger(amount) || amount <= 0) {
    return interaction.reply({ content: say('❌ Tempt me with a positive amount, Kitten.', 'Amount must be a positive integer.'), ephemeral: true });
  }
  try {
    const { chips } = await burnFromUser(interaction.guild?.id, target.id, amount, reason, interaction.user.id);
    const logLines = kittenMode
      ? [
          `${emoji('moneyWings')} **Cash Out**`,
          `User: My indulgent Kitten <@${target.id}> • Amount: **${ctx.chipsAmount(amount)}**${reason ? ` • Reason: ${reason}` : ''}`,
          `User Chips (after): **${ctx.chipsAmount(chips)}**`
        ]
      : [
          `${emoji('moneyWings')} **Cash Out**`,
          `User: <@${target.id}> • Amount: **${ctx.chipsAmount(amount)}**${reason ? ` • Reason: ${reason}` : ''}`,
          `User Chips (after): **${ctx.chipsAmount(chips)}**`
        ];
    await ctx.postCashLog(interaction, logLines);
    return interaction.reply({
      content: say(
        `✅ Burned **${ctx.chipsAmount(amount)}** from my temptress Kitten <@${target.id}>${reason ? ` (${reason})` : ''}.`,
        `✅ Burned **${ctx.chipsAmount(amount)}** from <@${target.id}>${reason ? ` (${reason})` : ''}.`
      ),
      ephemeral: true
    });
  } catch (e) {
    console.error(e);
    return interaction.reply({ content: say('❌ That cash out fizzled, Kitten. Try again soon.', '❌ Something went wrong.'), ephemeral: true });
  }
}
