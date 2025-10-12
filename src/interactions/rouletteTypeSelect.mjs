import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { emoji } from '../lib/emojis.mjs';

export default async function onRouletteTypeSelect(interaction, ctx) {
  const key = ctx.keyFor(interaction);
  const state = ctx.rouletteSessions.get(key);
  if (!state) return interaction.reply({ content: '❌ No active roulette session.', ephemeral: true });
  if (ctx.hasActiveExpired(interaction.guild.id, interaction.user.id, 'roulette') || !ctx.getActiveSession(interaction.guild.id, interaction.user.id)) {
    ctx.rouletteSessions.delete(key);
    return interaction.reply({ content: '⌛ Your roulette session expired. Use `/roulette` to start a new one.', ephemeral: true });
  }
  ctx.touchActiveSession(interaction.guild.id, interaction.user.id, 'roulette');
  const type = interaction.values[0];
  state.pendingType = type;
  const modal = new ModalBuilder().setCustomId(`rou|modal|${type}`).setTitle(`${emoji('roulette')} Add Bet`);
  if (type === 'straight') {
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pocket').setLabel('Pocket (0, 00, or 1–36)').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Amount').setStyle(TextInputStyle.Short).setRequired(true))
    );
  } else {
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel('Amount').setStyle(TextInputStyle.Short).setRequired(true))
    );
  }
  return interaction.showModal(modal);
}
