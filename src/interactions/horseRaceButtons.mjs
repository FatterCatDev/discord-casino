import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import {
  getRaceById,
  handleRaceCancel,
  handleHorseBet,
  handleRaceStart,
  showRaceNotice,
  acknowledgeInteraction
} from '../games/horserace.mjs';
import { emoji } from '../lib/emojis.mjs';
import { scheduleInteractionAck } from '../lib/interactionAck.mjs';

const HORSE_BUTTON_ACK_MS = (() => {
  const specific = Number(process.env.HORSE_RACE_BUTTON_ACK_MS);
  if (Number.isFinite(specific) && specific > 0) return specific;
  const general = Number(process.env.INTERACTION_STALE_MS);
  return Number.isFinite(general) && general > 0 ? general : 2500;
})();

export default async function handleHorseRaceButtons(interaction) {
  const parts = interaction.customId.split('|');
  const action = parts[1];
  const raceId = parts[2];
  const state = getRaceById(raceId);

  if (!state) {
    try { await interaction.deferUpdate(); } catch {}
    return;
  }

  const cancelAutoAck = scheduleInteractionAck(interaction, { timeout: HORSE_BUTTON_ACK_MS, mode: 'update' });
  interaction.__horseRaceCancelAck = cancelAutoAck;

  if (action === 'pick') {
    const horseIndex = Number(parts[3]);
    if (!Number.isInteger(horseIndex) || horseIndex < 0 || horseIndex >= 5) {
      await acknowledgeInteraction(interaction);
      await showRaceNotice(state, interaction.client, `${emoji('warning')} Invalid horse selection.`);
      return;
    }

    if (state.status === 'countdown') {
      await acknowledgeInteraction(interaction);
      await showRaceNotice(state, interaction.client, `${emoji('warning')} Countdown in progress; bets are locked.`);
      return;
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
      cancelAutoAck();
      interaction.__horseRaceCancelAck = null;
      return interaction.showModal(modal);
    }

    if (state.status === 'running') {
      const existing = state.bets.get(interaction.user.id);
      if (!existing) {
        await acknowledgeInteraction(interaction);
        await showRaceNotice(state, interaction.client, `${emoji('warning')} You must have an active bet from the betting phase to switch horses mid-race.`);
        return;
      }
      if (existing.horse === horseIndex) {
        await acknowledgeInteraction(interaction);
        await showRaceNotice(state, interaction.client, `${emoji('warning')} You are already backing that horse.`);
        return;
      }
      return handleHorseBet(interaction, state, horseIndex, existing.originalAmount);
    }

    await acknowledgeInteraction(interaction);
    await showRaceNotice(state, interaction.client, `${emoji('warning')} Betting is closed for this race.`);
    return;
  }

  if (action === 'cancel') {
    if (!(state.status === 'betting' || state.status === 'countdown')) {
      await acknowledgeInteraction(interaction);
      await showRaceNotice(state, interaction.client, `${emoji('warning')} You can only cancel before the race begins.`);
      return;
    }
    return handleRaceCancel(interaction, state);
  }

  if (action === 'confirm') {
    return handleRaceStart(interaction, state);
  }

  await acknowledgeInteraction(interaction);
}
