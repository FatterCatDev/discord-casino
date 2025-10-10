import { getRaceById, handleHorseBet, showRaceNotice, acknowledgeInteraction } from '../games/horserace.mjs';

export default async function handleHorseRaceBetModal(interaction) {
  const parts = interaction.customId.split('|');
  const raceId = parts[2];
  const horseIndex = Number(parts[3]);
  const state = getRaceById(raceId);

  if (!state) {
    await acknowledgeInteraction(interaction);
    return;
  }

  const amountRaw = interaction.fields.getTextInputValue('amount');

  const amount = Number.parseInt(amountRaw, 10);

  if (!Number.isInteger(horseIndex) || horseIndex < 0 || horseIndex >= 5) {
    await acknowledgeInteraction(interaction);
    await showRaceNotice(state, interaction.client, '⚠ Invalid horse selection.');
    return;
  }

  await handleHorseBet(interaction, state, horseIndex, amount);
}
