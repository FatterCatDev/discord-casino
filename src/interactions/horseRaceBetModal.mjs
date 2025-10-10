import { getRaceById, handleHorseBet } from '../games/horserace.mjs';

export default async function handleHorseRaceBetModal(interaction) {
  const parts = interaction.customId.split('|');
  const raceId = parts[2];
  const horseIndex = Number(parts[3]);
  const state = getRaceById(raceId);

  if (!state) {
    return interaction.reply({ content: '❌ This race has already finished.', ephemeral: true });
  }

  const amountRaw = interaction.fields.getTextInputValue('amount');

  const amount = Number.parseInt(amountRaw, 10);

  if (!Number.isInteger(horseIndex) || horseIndex < 0 || horseIndex >= 5) {
    return interaction.reply({ content: '❌ Invalid horse selection.', ephemeral: true });
  }

  await handleHorseBet(interaction, state, horseIndex, amount);
}
