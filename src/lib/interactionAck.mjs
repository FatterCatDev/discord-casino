const DEFAULT_TIMEOUT_MS = 2000;

export function scheduleInteractionAck(interaction, options = {}) {
  if (!interaction || typeof interaction !== 'object') return () => {};
  const {
    timeout = DEFAULT_TIMEOUT_MS,
    mode = 'update',
    signal
  } = options;

  let cleared = false;
  const delay = Number(timeout);
  const effectiveTimeout = Number.isFinite(delay) && delay > 0 ? delay : DEFAULT_TIMEOUT_MS;

  const timer = setTimeout(() => {
    if (cleared) return;
    if (interaction.deferred || interaction.replied) {
      cleared = true;
      return;
    }
    if (mode === 'update') {
      interaction.deferUpdate().catch(() => {});
    } else if (mode === 'reply') {
      interaction.deferReply().catch(() => {});
    } else if (mode === 'reply-ephemeral') {
      interaction.deferReply({ ephemeral: true }).catch(() => {});
    }
    cleared = true;
  }, effectiveTimeout);

  const clear = () => {
    if (cleared) return;
    cleared = true;
    clearTimeout(timer);
    if (signal && typeof signal.removeEventListener === 'function') {
      signal.removeEventListener('abort', clear);
    }
  };

  if (signal && typeof signal.addEventListener === 'function') {
    if (signal.aborted) {
      clear();
    } else {
      signal.addEventListener('abort', clear, { once: true });
    }
  }

  return clear;
}
