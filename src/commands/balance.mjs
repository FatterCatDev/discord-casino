import { getUserBalances } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';

export default async function handleBalance(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const target = interaction.options.getUser('user') ?? interaction.user;
  if (target.id !== interaction.user.id && !(await ctx.isModerator(interaction))) {
    return interaction.reply({ content: say('❌ Only my trusted moderators may peek at another Kitten’s balance.', '❌ Only moderators can view other users’ balances.'), ephemeral: true });
  }
  const { chips, credits } = await getUserBalances(interaction.guild?.id, target.id);
  const fmt = new Intl.NumberFormat('en-US');
  const header = target.id === interaction.user.id
    ? say('Your balance, Kitten', 'Your balance')
    : say(`My polished Kitten <@${target.id}>`, `Balance for <@${target.id}>`);
  return interaction.reply({
    content: say(
      `${emoji('receipt')} **${header}**\n${emoji('creditCard')} Credits: **${fmt.format(credits)}**\n${emoji('moneyBag')} Chips: **${ctx.chipsAmount(chips)}**\n${emoji('globe')} Economy: Global\nSavor it, Kitten <@${target.id}>`,
      `${emoji('receipt')} **${header}**\n${emoji('creditCard')} Credits: **${fmt.format(credits)}**\n${emoji('moneyBag')} Chips: **${ctx.chipsAmount(chips)}**\n${emoji('globe')} Economy: Global`
    ),
    ephemeral: true
  });
}
