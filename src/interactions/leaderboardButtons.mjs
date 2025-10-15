import { advanceLeaderboardSession } from '../lib/leaderboardSessions.mjs';

export default async function handleLeaderboardButtons(interaction) {
  const parts = interaction.customId.split('|');
  const sessionId = parts[1];
  const action = parts[2] || 'noop';

  if (!sessionId) {
    return interaction.reply({ content: '❌ Leaderboard session is not available.', ephemeral: true });
  }

  if (action === 'noop') {
    return interaction.deferUpdate().catch(() => {});
  }

  const payload = advanceLeaderboardSession(sessionId, action);
  if (!payload) {
    return interaction.reply({
      content: '❌ This leaderboard view has expired. Run `/leaderboard` again to refresh it.',
      ephemeral: true
    });
  }

  return interaction.update(payload);
}
