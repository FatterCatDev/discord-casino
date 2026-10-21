import { Events } from 'discord.js';
import { createCommandContext } from './context.mjs';
import { createComponentRouter } from './component-routing.mjs';
import { createInteractionHandler } from './interactions.mjs';
import { createOrphanCleanup } from './orphan-cleanup.mjs';
import { createBackgroundTasks } from './background.mjs';
import { registerGuildEvents } from './events.mjs';
import { registerProcessErrors } from './process-errors.mjs';

const registrations = new WeakMap();

export function registerRuntime(client) {
  if (registrations.has(client)) return registrations.get(client);

  const buildCommandContext = createCommandContext(client);
  const routeComponent = createComponentRouter(buildCommandContext);
  const handleInteraction = createInteractionHandler(buildCommandContext, routeComponent);
  const orphanCleanup = createOrphanCleanup();
  const background = createBackgroundTasks(client, orphanCleanup.scheduleStartupHoldemOrphanSweep);
  const unregisterProcessErrors = registerProcessErrors();
  const unregisterGuildEvents = registerGuildEvents(
    client, background.pushBotStatusSnapshot,
    background.triggerTopggStats, background.triggerDiscordForgeStats
  );
  client.once(Events.ClientReady, background.startBackgroundTasks);
  client.on(Events.InteractionCreate, handleInteraction);

  const runtime = {
    dispose() {
      client.off(Events.ClientReady, background.startBackgroundTasks);
      client.off(Events.InteractionCreate, handleInteraction);
      unregisterGuildEvents();
      unregisterProcessErrors();
      orphanCleanup.dispose();
      background.dispose();
    }
  };
  registrations.set(client, runtime);
  return runtime;
}
