export function syncKittenPersona(state, ctx) {
  if (!state || !ctx) return;
  try {
    if (typeof ctx.kittenModeEnabled === 'boolean') state.kittenMode = ctx.kittenModeEnabled;
    if (typeof ctx.kittenizeText === 'function') state.kittenizeText = ctx.kittenizeText;
    if (typeof ctx.kittenizePayload === 'function') state.kittenizePayload = ctx.kittenizePayload;
  } catch {}
}

export function applyKittenPayload(state, payload) {
  if (!state || typeof state?.kittenizePayload !== 'function') return payload;
  try {
    return state.kittenizePayload(payload);
  } catch { return payload; }
}

export function applyKittenText(state, text) {
  if (!state || typeof state?.kittenizeText !== 'function') return text;
  try {
    return state.kittenizeText(text);
  } catch { return text; }
}
