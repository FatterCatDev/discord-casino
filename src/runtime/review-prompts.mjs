import { recordUserInteraction, markUserInteractionReviewPrompt } from '../db/db.auto.mjs';
import {
  REVIEW_PROMPT_INTERACTION_THRESHOLD,
  REVIEW_PROMPT_RETRY_SECONDS,
  REVIEW_PROMPT_MESSAGE,
  REVIEW_PROMPT_SUPPORT_MESSAGE
} from './config.mjs';

export function describeInteractionForLogging(interaction) {
  const fallback = { type: 'unknown', key: null, metadata: null };
  if (!interaction || typeof interaction !== 'object') return fallback;

  try {
    if (typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand()) {
      const metadata = { commandName: interaction.commandName };
      try {
        const subGroup = interaction.options?.getSubcommandGroup?.(false);
        if (subGroup) metadata.subcommandGroup = subGroup;
      } catch {}
      try {
        const subCmd = interaction.options?.getSubcommand?.(false);
        if (subCmd) metadata.subcommand = subCmd;
      } catch {}
      return { type: 'chat_input', key: interaction.commandName, metadata };
    }
    if (typeof interaction.isUserContextMenuCommand === 'function' && interaction.isUserContextMenuCommand()) {
      return { type: 'user_context_menu', key: interaction.commandName, metadata: { commandName: interaction.commandName } };
    }
    if (typeof interaction.isMessageContextMenuCommand === 'function' && interaction.isMessageContextMenuCommand()) {
      return { type: 'message_context_menu', key: interaction.commandName, metadata: { commandName: interaction.commandName } };
    }
    if (typeof interaction.isButton === 'function' && interaction.isButton()) {
      return { type: 'button', key: interaction.customId, metadata: { customId: interaction.customId } };
    }
    if (typeof interaction.isStringSelectMenu === 'function' && interaction.isStringSelectMenu()) {
      return { type: 'string_select', key: interaction.customId, metadata: { customId: interaction.customId, values: Array.isArray(interaction.values) ? interaction.values : [] } };
    }
    const selectHelpers = [
      ['isUserSelectMenu', 'user_select'],
      ['isRoleSelectMenu', 'role_select'],
      ['isMentionableSelectMenu', 'mentionable_select'],
      ['isChannelSelectMenu', 'channel_select']
    ];
    for (const [fn, type] of selectHelpers) {
      if (typeof interaction[fn] === 'function' && interaction[fn]()) {
        return { type, key: interaction.customId, metadata: { customId: interaction.customId, values: Array.isArray(interaction.values) ? interaction.values : [] } };
      }
    }
    if (typeof interaction.isModalSubmit === 'function' && interaction.isModalSubmit()) {
      const fieldCount = interaction.fields?.fields ? interaction.fields.fields.size ?? 0 : 0;
      return { type: 'modal_submit', key: interaction.customId, metadata: { customId: interaction.customId, fieldCount } };
    }
    if (typeof interaction.isAutocomplete === 'function' && interaction.isAutocomplete()) {
      return { type: 'autocomplete', key: interaction.commandName || null, metadata: { commandName: interaction.commandName || null } };
    }
  } catch (err) {
    console.error('describeInteractionForLogging failed', err);
  }

  return fallback;
}

async function maybeSendReviewPrompt(interaction, stats) {
  const userId = interaction?.user?.id;
  if (!userId) return;
  const total = Number(stats?.total_interactions || 0);
  if (!Number.isFinite(total) || total < REVIEW_PROMPT_INTERACTION_THRESHOLD) return;

  const sentAt = Number(stats?.review_prompt_sent_at || 0);
  if (sentAt) return;

  const nowSec = Math.floor(Date.now() / 1000);
  const lastAttempt = Number(stats?.review_prompt_attempted_at || 0);
  if (lastAttempt && nowSec - lastAttempt < REVIEW_PROMPT_RETRY_SECONDS) return;

  try {
    await interaction.user.send(REVIEW_PROMPT_MESSAGE);
    try {
      await interaction.user.send(REVIEW_PROMPT_SUPPORT_MESSAGE);
    } catch (supportErr) {
      console.error(`Failed to send review prompt support link to ${userId}`, supportErr);
    }
    try {
      await markUserInteractionReviewPrompt(userId, { status: 'sent', timestamp: nowSec });
    } catch (markErr) {
      console.error(`Failed to record successful review prompt for ${userId}`, markErr);
    }
  } catch (err) {
    console.error(`Failed to send review prompt DM to ${userId}`, err);
    const message = err?.message ? String(err.message).slice(0, 512) : 'unknown_error';
    try {
      await markUserInteractionReviewPrompt(userId, { status: 'failed', error: message, timestamp: nowSec });
    } catch (markErr) {
      console.error(`Failed to record failed review prompt for ${userId}`, markErr);
    }
  }
}

export function queueInteractionLogging(interaction) {
  (async () => {
    const userId = interaction?.user?.id;
    if (!userId) return;
    const { type, key, metadata } = describeInteractionForLogging(interaction);
    try {
      const stats = await recordUserInteraction({
        userId,
        guildId: interaction?.guild?.id || null,
        channelId: interaction?.channelId || null,
        interactionType: type,
        interactionKey: key,
        locale: typeof interaction?.locale === 'string' ? interaction.locale : null,
        metadata
      });
      if (stats) {
        await maybeSendReviewPrompt(interaction, stats);
      }
    } catch (err) {
      console.error('Interaction logging failed', err);
    }
  })();
}
