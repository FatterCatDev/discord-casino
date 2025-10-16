import { emoji } from '../lib/emojis.mjs';

export default async function handleBlackjackBetModal(interaction, ctx) {
  const parts = interaction.customId.split('|');
  const table = parts[2];
  const ownerId = parts[3] || interaction.user.id;

  if (ownerId && ownerId !== interaction.user.id) {
    return interaction.reply({ content: '❌ Only the original player can adjust this bet.', ephemeral: true });
  }

  const rawInput = interaction.fields.getTextInputValue('bet')?.trim() || '';
  const bet = Number(rawInput);
  if (!Number.isInteger(bet) || bet <= 0) {
    return interaction.reply({ content: `${emoji('warning')} Bet must be a positive whole number.`, ephemeral: true });
  }

  if (table === 'HIGH' && bet < 100) {
    return interaction.reply({ content: `${emoji('warning')} The high table minimum is 100 chips.`, ephemeral: true });
  }
  if (table === 'LOW' && bet > 99) {
    return interaction.reply({ content: `${emoji('warning')} The low table maximum is 99 chips.`, ephemeral: true });
  }
  if (table !== 'HIGH' && table !== 'LOW') {
    return interaction.reply({ content: `${emoji('warning')} Invalid table selection. Try starting a new hand with /blackjack.`, ephemeral: true });
  }

  const key = ctx.keyFor(interaction);
  ctx.blackjackGames.delete(key);
  return ctx.startBlackjack(interaction, table, bet);
}
