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

  const activeSession = ctx.getActiveSession(interaction.guildId, interaction.user.id);
  const channelId = activeSession?.msgChannelId;
  const messageId = activeSession?.msgId;

  let targetMessage = null;
  if (channelId && messageId) {
    try {
      const channel = await interaction.client.channels.fetch(channelId);
      if (channel?.isTextBased()) {
        targetMessage = await channel.messages.fetch(messageId).catch(() => null);
      }
    } catch {
      targetMessage = null;
    }
  }

  if (!targetMessage) {
    const result = await ctx.startBlackjack(interaction, table, bet);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: `${emoji('warning')} Could not refresh the existing hand, so I posted a new game message.`,
        ephemeral: true
      });
    }
    return result;
  }

  if (!interaction.deferred && !interaction.replied) {
    try { await interaction.deferUpdate(); } catch {}
  }

  const proxy = Object.create(interaction);
  proxy.isButton = () => true;
  proxy.channelId = targetMessage.channelId;
  proxy.message = targetMessage;
  proxy.update = async (payload) => {
    const edited = await targetMessage.edit(payload);
    return edited;
  };
  proxy.fetchReply = async () => targetMessage;

  try {
    await ctx.startBlackjack(proxy, table, bet);
  } catch (err) {
    console.error('Failed to restart Blackjack with updated bet:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '⚠️ Something went wrong refreshing the table. Try again.', ephemeral: true });
    }
    return;
  }
}
