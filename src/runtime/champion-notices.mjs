import { chipsAmount } from '../games/format.mjs';
import { claimChampionNotice } from '../services/championRole.mjs';
import { emoji } from '../lib/emojis.mjs';

export async function maybeSendChampionNotice(interaction) {
  try {
    if (!interaction?.user?.id) return;
    const notice = claimChampionNotice(interaction.user.id);
    if (!notice) return;
    let content = '';
    if (notice.type === 'gained') {
      const amount = chipsAmount(Math.max(0, Number(notice.chips || 0)));
      content = `${emoji('trophy')} You just claimed the #1 leaderboard spot with **${amount}** chips! Keep the streak going.`;
    } else if (notice.type === 'lost') {
      const dethronedBy = notice.dethronedBy ? ` by <@${notice.dethronedBy}>` : '';
      content = `${emoji('chartDown')} You lost the #1 leaderboard spot${dethronedBy}. Time to win it back!`;
    } else {
      return;
    }

    if (typeof interaction.isRepliable === 'function' && interaction.isRepliable()) {
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content, ephemeral: true });
          return;
        }
      } catch (err) {
        console.warn('Champion notice follow-up failed', err);
      }
    }

    try {
      await interaction.user.send(content);
    } catch (err) {
      console.warn(`Champion notice DM failed for ${interaction.user.id}`, err);
    }
  } catch (err) {
    console.error('maybeSendChampionNotice failed', err);
  }
}
