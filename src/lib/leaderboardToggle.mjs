import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export function decorateLeaderboardPayload(payload, { view, chipsSessionId, sharesSessionId }) {
  if (!payload) return null;
  if (!chipsSessionId || !sharesSessionId) return payload;
  const activeView = view === 'shares' ? 'shares' : 'chips';
  const targetView = activeView === 'chips' ? 'shares' : 'chips';
  const label = targetView === 'shares' ? 'Show Cartel Shares' : 'Show Chip Leaderboard';
  const toggleBtn = new ButtonBuilder()
    .setCustomId(`leader|toggle|${targetView}|${chipsSessionId}|${sharesSessionId}`)
    .setStyle(ButtonStyle.Secondary)
    .setLabel(label);
  const toggleRow = new ActionRowBuilder().addComponents(toggleBtn);
  const existing = Array.isArray(payload.components) ? payload.components : [];
  return {
    ...payload,
    components: [...existing, toggleRow]
  };
}
