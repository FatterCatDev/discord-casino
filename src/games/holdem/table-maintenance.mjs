import { holdemTables, tableKey } from './state.mjs';
import { buildClosedPayload } from './presentation.mjs';
import { updateTableCard } from './messages.mjs';

export function removeUnderBBSeats(state) {
  try {
    const bb = Number(state.bb) || 0;
    const removed = [];
    const kept = [];
    for (const s of state.seats) {
      if (s.stack < bb) removed.push({ userId: s.userId, stack: s.stack }); else kept.push(s);
    }
    if (removed.length) {
      state.seats = kept;
      state.buttonIndex = 0;
      state.toAct = null;
    }
    return removed;
  } catch { return []; }
}

export async function closeTable(client, state, mode = 'empty') {
  if (state.closed) return;
  state.closed = true;
  const key = tableKey(state.guildId, state.channelId);
  if (holdemTables.get(key) === state) holdemTables.delete(key);
  try {
    // Stop timers
    try { if (state.closeTimer) clearTimeout(state.closeTimer); } catch {}
    try { if (state.actionTimer) clearTimeout(state.actionTimer); } catch {}
    try { if (state.warningTimer) clearTimeout(state.warningTimer); } catch {}
    try { if (state.nextHandTimer) clearTimeout(state.nextHandTimer); } catch {}
    try { if (state.nextHandInterval) clearInterval(state.nextHandInterval); } catch {}
    if (state.hostKickTimer) clearTimeout(state.hostKickTimer);
    state.hostKickTimer = null;
    state.hostKickDeadline = null;
    state.actionUserId = null;
    state.actionDeadline = null;
    state.closeTimer = state.actionTimer = state.warningTimer = state.nextHandTimer = state.nextHandInterval = null;
    state.closeDeadline = null; state.closeMode = null;
    // If this was a temporary channel, delete it; otherwise update UI
    if (state.tempChannel) {
      try {
        const chId = state.msgChannelId || state.channelId;
        const ch = await client.channels.fetch(chId).catch(() => null);
        if (ch && ch.deletable) await ch.delete(`Hold'em table closed (${mode})`);
      } catch {}
    } else {
      try { await updateTableCard(client, state, buildClosedPayload(mode)); } catch {}
    }
  } catch {}
  // Also delete the original "table created" summary message, if we know it
  try {
    if (state.originMsgChannelId && state.originMsgId) {
      const och = await client.channels.fetch(state.originMsgChannelId).catch(() => null);
      if (och && och.isTextBased && och.isTextBased()) {
        const om = await och.messages.fetch(state.originMsgId).catch(() => null);
        if (om) await om.delete().catch(() => {});
      }
    }
  } catch {}
}

export function scheduleEmptyClose(client, state, ms = 2 * 60 * 1000) {
  try { if (state.closeTimer) { clearTimeout(state.closeTimer); state.closeTimer = null; } } catch {}
  if (!state || state.closed || state.seats.length > 0) return;
  state.closeMode = 'empty';
  state.closeDeadline = Date.now() + ms;
  const closeTimer = setTimeout(() => {
    if (state.closed || state.closeTimer !== closeTimer) return;
    try { if (state.seats.length === 0) closeTable(client, state, 'empty'); } catch {}
    try { state.closeTimer = null; } catch {}
  }, ms);
  state.closeTimer = closeTimer;
}

export function scheduleLobbyClose(client, state, ms = 10 * 60 * 1000) {
  try { if (state.closeTimer) { clearTimeout(state.closeTimer); state.closeTimer = null; } } catch {}
  if (!state || state.closed || state.seats.length === 0) return; // use empty close instead
  if (state.phase !== 'LOBBY') return; // only when waiting to start
  state.closeMode = 'lobby';
  state.closeDeadline = Date.now() + ms;
  const closeTimer = setTimeout(() => {
    if (state.closed || state.closeTimer !== closeTimer) return;
    try { if (state.phase === 'LOBBY' && state.seats.length >= 1) closeTable(client, state, 'idle'); } catch {}
    try { state.closeTimer = null; } catch {}
  }, ms);
  state.closeTimer = closeTimer;
}
