import { EmbedBuilder } from 'discord.js';
import { touchUserActivityLifecycle, reactivateUserWithComebackBonus } from '../db/db.auto.mjs';
import { chipsAmount } from '../games/format.mjs';
import { COMEBACK_BONUS_CHIPS, COMEBACK_BONUS_ENABLED } from './config.mjs';
import { hasModeratorAccess } from './access.mjs';

function buildComebackWelcomeEmbed(interaction, result) {
  const amount = Math.max(0, Number(result?.bonusAmount || 0));
  const commandName = interaction?.commandName ? `/${interaction.commandName}` : 'Unknown';
  const ts = Math.floor(Date.now() / 1000);
  const fields = [
    { name: 'Bonus Granted', value: amount > 0 ? chipsAmount(amount) : 'No bonus this cycle', inline: true },
    { name: 'Triggered By', value: commandName, inline: true },
    { name: 'Time', value: `<t:${ts}:F>`, inline: false }
  ];
  return new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle('Welcome Back to Semuta Casino')
    .setDescription('Your inactivity status has been cleared and your comeback flow is complete.')
    .addFields(fields);
}

export async function maybeHandleInactivityLifecycle(interaction) {
  try {
    if (!interaction || typeof interaction.isChatInputCommand !== 'function' || !interaction.isChatInputCommand()) return null;
    const userId = interaction.user?.id;
    if (!userId) return null;
    const guildId = interaction.guild?.id || null;
    if (await hasModeratorAccess(guildId, userId)) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    const touched = await touchUserActivityLifecycle(userId, nowSec);
    if (!touched?.is_inactive) return null;

    const result = await reactivateUserWithComebackBonus(guildId, userId, {
      bonusAmount: COMEBACK_BONUS_ENABLED ? COMEBACK_BONUS_CHIPS : 0,
      reason: 'comeback bonus',
      adminId: 'comeback:auto',
      timestamp: nowSec,
      triggerCommand: interaction.commandName || null
    });
    if (!result?.reactivated) return null;
    return result;
  } catch (err) {
    console.error('Inactivity lifecycle handling failed', err);
    return null;
  }
}

export async function maybeSendComebackWelcomeDm(interaction, result) {
  try {
    if (!result?.reactivated) return;
    const embed = buildComebackWelcomeEmbed(interaction, result);
    await interaction.user.send({ embeds: [embed] });
  } catch (err) {
    console.warn(`Failed to send comeback welcome DM to ${interaction?.user?.id || 'unknown'}`, err);
  }
}
