import { MessageFlags } from 'discord.js';
import { kittenizeReplyArg } from '../services/persona.mjs';

const RESPONSE_PATCHED = Symbol('responsePatched');
const KITTEN_PATCHED = Symbol('kittenModePatched');

export function normalizeEphemeralOption(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  if (!Object.prototype.hasOwnProperty.call(payload, 'ephemeral')) return payload;

  const cloned = { ...payload };
  const { ephemeral } = cloned;
  delete cloned.ephemeral;

  if (ephemeral) {
    const currentFlags = typeof cloned.flags === 'number' ? cloned.flags : 0;
    cloned.flags = currentFlags | MessageFlags.Ephemeral;
  }
  return cloned;
}

export function patchInteractionResponseMethods(interaction) {
  if (!interaction || interaction[RESPONSE_PATCHED]) return;
  const methods = ['reply', 'editReply', 'followUp', 'update', 'deferReply', 'deferUpdate'];
  for (const method of methods) {
    if (typeof interaction[method] !== 'function') continue;
    const original = interaction[method].bind(interaction);
    interaction[method] = (...args) => {
      if (args.length > 0) {
        const next = normalizeEphemeralOption(args[0]);
        if (next !== args[0]) args[0] = next;
      }
      return original(...args);
    };
  }
  interaction[RESPONSE_PATCHED] = true;
}

export function applyKittenModeToInteraction(interaction) {
  if (!interaction || interaction[KITTEN_PATCHED]) return;
  const methods = ['reply', 'editReply', 'followUp', 'update'];
  for (const method of methods) {
    if (typeof interaction[method] !== 'function') continue;
    const original = interaction[method].bind(interaction);
    interaction[method] = (...args) => {
      if (args.length > 0) {
        args[0] = kittenizeReplyArg(args[0]);
      }
      return original(...args);
    };
  }
  interaction[KITTEN_PATCHED] = true;
}
