import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { getRaceById, handleRaceCancel, handleRaceStart } from '../games/horserace.mjs';

export default async function handleHorseRaceButtons(interaction) {
  const parts = interaction.customId.split('|');
  const action = parts[1];
  const raceId = parts[2];
  const state = getRaceById(raceId);

  if (!state) {
    return interaction.reply({ content: '❌ This race has already finished.', ephemeral: true });
  }

  if (action === 'bet') {
    if (state.status === 'countdown') {
      return interaction.reply({ content: '❌ Bets are locked during the countdown.', ephemeral: true });
    }
    if (!(state.status === 'betting' || state.status === 'running')) {
      return interaction.reply({ content: '❌ Betting is closed for this race.', ephemeral: true });
    }

    const modal = new ModalBuilder()
      .setCustomId(`horse|betmodal|${raceId}`)
      .setTitle('Place/Update Horse Bet');

    const horseInput = new TextInputBuilder()
      .setCustomId('horse')
      .setLabel('Horse number (1-5)')
      .setPlaceholder('Enter a number from 1 to 5')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const amountInput = new TextInputBuilder()
      .setCustomId('amount')
      .setLabel('Bet amount (chips)')
      .setPlaceholder('Enter a positive whole number')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(horseInput),
      new ActionRowBuilder().addComponents(amountInput)
    );

    return interaction.showModal(modal);
  }

  if (action === 'cancel') {
    if (state.status !== 'betting') {
      return interaction.reply({ content: '❌ You can only cancel while the race is still in betting.', ephemeral: true });
    }
    return handleRaceCancel(interaction, state);
  }

  if (action === 'confirm') {
    return handleRaceStart(interaction, state);
  }

  return interaction.reply({ content: '❌ Unknown action.', ephemeral: true });
}
