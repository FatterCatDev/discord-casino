import { endActiveSessionForUser } from '../games/session.mjs';
import { getGuildSettingsCached, invalidateGuildSettingsCache, invalidateAccessCache } from './caches.mjs';
import { maybePromptNewPlayer, handleWelcomeAcknowledgement } from './onboarding.mjs';
import { clearUserNewsState, maybeSendNewsReminder } from './news-notices.mjs';
import { queueInteractionLogging } from './review-prompts.mjs';
import { maybeSendChampionNotice } from './champion-notices.mjs';
import { maybeHandleInactivityLifecycle, maybeSendComebackWelcomeDm } from './comeback.mjs';
import { patchInteractionResponseMethods, applyKittenModeToInteraction } from './responses.mjs';
import { SETTINGS_MUTATION_COMMANDS, ACCESS_MUTATION_COMMANDS, commandHandlers } from './commands.mjs';
import { WELCOME_ACK_CUSTOM_ID } from './config.mjs';
import { isModerator } from './access.mjs';

export function createInteractionHandler(buildCommandContext, routeComponent) {
  async function handleInteraction(interaction) {
    try {
      patchInteractionResponseMethods(interaction);
      const guildId = interaction.guild?.id || null;
      let kittenModeEnabled = false;
      if (guildId) {
        try {
          const settings = await getGuildSettingsCached(guildId);
          kittenModeEnabled = !!(settings && settings.kitten_mode_enabled);
        } catch (err) {
          console.error('Failed to read kitten mode setting:', err);
        }
      }
      if (kittenModeEnabled) applyKittenModeToInteraction(interaction);
      const ctxExtras = { kittenMode: kittenModeEnabled };

      queueInteractionLogging(interaction);

      if (interaction.isChatInputCommand()) {
        const gated = await maybePromptNewPlayer(interaction);
        if (gated) return;

        // End any existing active game session when a new command is run.
        // Capture the promise so game commands can await it before starting new sessions.
        const sessionCleanupPromise = endActiveSessionForUser(interaction, 'new_command').catch(err => {
          console.error('endActiveSessionForUser (command) error:', err);
        });

        const comebackResult = await maybeHandleInactivityLifecycle(interaction);

        const handler = commandHandlers[interaction.commandName];
        if (typeof handler === 'function') {
          const ctx = buildCommandContext(interaction, { ...ctxExtras, sessionCleanupPromise });
          const result = await handler(interaction, ctx);
          if (SETTINGS_MUTATION_COMMANDS.has(interaction.commandName)) {
            invalidateGuildSettingsCache(guildId);
          }
          if (ACCESS_MUTATION_COMMANDS.has(interaction.commandName)) {
            invalidateAccessCache(guildId);
          }
          if (interaction.commandName === 'news') {
            clearUserNewsState(interaction.user?.id || null);
          }
          await maybeSendNewsReminder(interaction);
          await maybeSendComebackWelcomeDm(interaction, comebackResult);
          return result;
        }
        await maybeSendComebackWelcomeDm(interaction, comebackResult);
        return interaction.reply({ content: '❌ Unknown command.', ephemeral: true });
      }

      if (interaction.isButton() && interaction.customId === WELCOME_ACK_CUSTOM_ID) {
        await handleWelcomeAcknowledgement(interaction);
        return;
      }
      if (interaction.isModalSubmit() && interaction.customId.startsWith('req|rejmodal|')) {
        if (!(await isModerator(interaction))) {
          return interaction.reply({ content: '❌ Moderators only.', ephemeral: true });
        }
      }
      // Return handler promises without awaiting, as in the original event callback.
      return routeComponent(interaction, ctxExtras);
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && Number(err.code) === 10062) {
        console.warn('Skipped error response for expired interaction (code 10062)');
        return;
      }
      console.error(err);
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: '❌ Unexpected error.', ephemeral: true }).catch(()=>{});
        } else {
          await interaction.reply({ content: '❌ Unexpected error.', ephemeral: true }).catch(()=>{});
        }
      } catch (followErr) {
        console.error('Failed to send error response:', followErr);
      }
    } finally {
      await maybeSendChampionNotice(interaction);
    }
  }
  return handleInteraction;
}
