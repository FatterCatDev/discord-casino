import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { getRaceById, handleRaceCancel, handleHorseBet, handleRaceStart } from '../games/horserace.mjs';

export default async function handleHorseRaceButtons(interaction) {
  const parts = interaction.customId.split('|');
  const action = parts[1];
  const raceId = parts[2];
  const state = getRaceById(raceId);

  if (!state) {
    return interaction.reply({ content: '❌ This race has already finished.' });
  }

  if (action === 'pick') {
    const horseIndex = Number(parts[3]);
    if (!Number.isInteger(horseIndex) || horseIndex < 0 || horseIndex >= 5) {
      return interaction.reply({ content: '❌ Invalid horse selection.' });
    }

    if (state.status === 'countdown') {
      return interaction.reply({ content: '❌ Countdown in progress; bets are locked.' });
    }

    if (state.status === 'betting') {
      const existing = state.bets.get(interaction.user.id);
      const modal = new ModalBuilder()
        .setCustomId(`horse|betmodal|${raceId}|${horseIndex}`)
        .setTitle(existing ? 'Update Horse Bet' : 'Place Horse Bet');

      const amountInput = new TextInputBuilder()
        .setCustomId('amount')
        .setLabel('Bet amount (chips)')
        .setPlaceholder('Enter a positive whole number')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      if (existing) amountInput.setValue(String(existing.originalAmount));

      modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
      return interaction.showModal(modal);
    }

    if (state.status === 'running') {
      const existing = state.bets.get(interaction.user.id);
      if (!existing) {
        return interaction.reply({ content: '❌ You must have an active bet from the betting phase to switch horses mid-race.' });
      }
      if (existing.horse === horseIndex) {
        return interaction.reply({ content: '❌ You are already backing that horse.' });
      }
      return handleHorseBet(interaction, state, horseIndex, existing.originalAmount);
    }

    return interaction.reply({ content: '❌ Betting is closed for this race.' });
  }

  if (action === 'cancel') {
    if (!(state.status === 'betting' || state.status === 'countdown')) {
      return interaction.reply({ content: '❌ You can only cancel before the race begins.' });
    }
    return handleRaceCancel(interaction, state);
  }

  if (action === 'confirm') {
    return handleRaceStart(interaction, state);
  }

  return interaction.reply({ content: '❌ Unknown action.' });
}
