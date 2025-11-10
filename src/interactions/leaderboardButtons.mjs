import {
  advanceLeaderboardSession,
  getLeaderboardSessionMeta,
  renderLeaderboardCurrent
} from '../lib/leaderboardSessions.mjs';
import { decorateLeaderboardPayload } from '../lib/leaderboardToggle.mjs';

export default async function handleLeaderboardButtons(interaction) {
  const parts = interaction.customId.split('|');
  if (parts[1] === 'toggle') {
    const targetView = parts[2];
    const chipsSessionId = parts[3];
    const sharesSessionId = parts[4];
    const targetSessionId = targetView === 'shares' ? sharesSessionId : chipsSessionId;
    if (!targetSessionId) {
      return interaction.reply({
        content: '❌ This leaderboard view has expired. Run `/leaderboard` again to refresh it.',
        ephemeral: true
      });
    }
    const payload = renderLeaderboardCurrent(targetSessionId);
    if (!payload) {
      return interaction.reply({
        content: '❌ This leaderboard view has expired. Run `/leaderboard` again to refresh it.',
        ephemeral: true
      });
    }
    const decorated = decorateLeaderboardPayload(payload, {
      view: targetView,
      chipsSessionId,
      sharesSessionId
    });
    if (!decorated) {
      return interaction.reply({
        content: '❌ This leaderboard view has expired. Run `/leaderboard` again to refresh it.',
        ephemeral: true
      });
    }
    return interaction.update(decorated);
  }

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

  const meta = getLeaderboardSessionMeta(sessionId) || {};
  const decorated = decorateLeaderboardPayload(payload, {
    view: meta.view || 'chips',
    chipsSessionId: meta.chipsSessionId,
    sharesSessionId: meta.sharesSessionId
  });
  if (!decorated) {
    return interaction.reply({
      content: '❌ This leaderboard view has expired. Run `/leaderboard` again to refresh it.',
      ephemeral: true
    });
  }

  return interaction.update(decorated);
}
