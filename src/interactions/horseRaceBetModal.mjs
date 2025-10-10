import { getRaceById, handleHorseBet } from '../games/horserace.mjs';

export default async function handleHorseRaceBetModal(interaction) {
  const parts = interaction.customId.split('|');
  const raceId = parts[2];
  const state = getRaceById(raceId);

  if (!state) {
    return interaction.reply({ content: '❌ This race has already finished.', ephemeral: true });
  }

  const horseRaw = interaction.fields.getTextInputValue('horse');
  const amountRaw = interaction.fields.getTextInputValue('amount');

  const horseNum = Number.parseInt(horseRaw, 10);
  const amount = Number.parseInt(amountRaw, 10);

  if (!Number.isInteger(horseNum) || horseNum < 1 || horseNum > 5) {
    return interaction.reply({ content: '❌ Please enter a horse number between 1 and 5.', ephemeral: true });
  }

  await handleHorseBet(interaction, state, horseNum - 1, amount);
}
