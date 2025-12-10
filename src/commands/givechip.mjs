import { emoji } from '../lib/emojis.mjs';

export default async function handleGiveChip(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const senderId = interaction.user.id;
  const target = interaction.options.getUser('user');
  const amount = interaction.options.getInteger('amount');

  if (!target) {
    return interaction.reply({ content: say('❌ I need to know which Kitten you want to spoil.', '❌ Please choose a recipient.'), ephemeral: true });
  }
  if (target.bot) {
    return interaction.reply({ content: say('❌ My feline spirit cannot send chips to mere automatons.', '❌ You cannot send chips to a bot.'), ephemeral: true });
  }
  if (target.id === senderId) {
    return interaction.reply({ content: say('❌ Keep those chips for treats, not to hand them back to yourself.', '❌ You cannot send chips to yourself.'), ephemeral: true });
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    return interaction.reply({ content: say('❌ Offer a positive amount if you want to share, sweetheart.', '❌ Amount must be a positive integer.'), ephemeral: true });
  }

  const debitReason = `givechip -> ${target.id}`;
  const creditReason = `givechip <- ${senderId}`;
  let senderBalances;
  try {
    senderBalances = await ctx.takeFromUserToHouse(senderId, amount, debitReason, null);
  } catch (err) {
    if (err?.message === 'INSUFFICIENT_USER') {
      return interaction.reply({ content: say('❌ Not enough chips in your paw to gift that much, Kitten.', '❌ You do not have enough chips to send that amount.'), ephemeral: true });
    }
    console.error('givechip debit failed', err);
    return interaction.reply({ content: say('❌ Something went wrong while moving those chips out, Kitten.', '❌ Something went wrong while debiting your chips.'), ephemeral: true });
  }

  let recipientBalances;
  try {
    recipientBalances = await ctx.transferFromHouseToUser(target.id, amount, creditReason, null);
  } catch (err) {
    console.error('givechip credit failed', err);
    try {
      await ctx.transferFromHouseToUser(senderId, amount, 'givechip refund', null);
    } catch (refundErr) {
      console.error('givechip refund failed', refundErr);
    }
    return interaction.reply({ content: say('❌ I could not complete the gift — your chips are safe with you.', '❌ Failed to deliver chips to the recipient; your chips were returned.'), ephemeral: true });
  }

  const logLines = kittenMode
    ? [
        `${emoji('gift')} **Kitten Gift**`,
        `From: <@${senderId}> • To: My cherished Kitten <@${target.id}> • Amount: **${ctx.chipsAmount(amount)}**`,
        `Sender Chips: **${ctx.chipsAmount(senderBalances.chips)}** • Recipient Chips: **${ctx.chipsAmount(recipientBalances.chips)}**`
      ]
    : [
        `${emoji('gift')} **Player Transfer**`,
        `From: <@${senderId}> • To: <@${target.id}> • Amount: **${ctx.chipsAmount(amount)}**`,
        `Sender Chips: **${ctx.chipsAmount(senderBalances.chips)}** • Recipient Chips: **${ctx.chipsAmount(recipientBalances.chips)}**`
      ];
  try {
    await ctx.postCashLog(interaction, logLines);
  } catch (err) {
    console.error('givechip log post failed', err);
  }
  try {
    const dmContent = say(
      `${emoji('gift')} <@${senderId}> just slipped you **${ctx.chipsAmount(amount)}** chips.\nYour balance now rests at **${ctx.chipsAmount(recipientBalances.chips)}** — spend them well, Kitten.`,
      `${emoji('gift')} You received **${ctx.chipsAmount(amount)}** chips from <@${senderId}>.\nYour new balance is **${ctx.chipsAmount(recipientBalances.chips)}**.`
    );
    await target.send(dmContent);
  } catch (dmErr) {
    console.error('givechip dm failed', dmErr);
  }

  return interaction.reply({
    content: say(
      `${emoji('gift')} You slipped **${ctx.chipsAmount(amount)}** to <@${target.id}>.\n• Your balance: **${ctx.chipsAmount(senderBalances.chips)}**\n• Their balance: **${ctx.chipsAmount(recipientBalances.chips)}**`,
      `${emoji('gift')} Sent **${ctx.chipsAmount(amount)}** to <@${target.id}>.\n• Your balance: **${ctx.chipsAmount(senderBalances.chips)}**\n• Recipient balance: **${ctx.chipsAmount(recipientBalances.chips)}**`
    ),
    ephemeral: true
  });
}
