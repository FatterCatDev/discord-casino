import { postGameLogByIds } from '../logging.mjs';
import { emoji } from '../../lib/emojis.mjs';
import { ensureTableInChannel } from './state.mjs';
import { syncKittenPersona } from './persona.mjs';
import { makeDeck } from './deck.mjs';
import { firstActiveAfter, afterActionMaybeAdvance, doFold, nextIndex } from './betting.mjs';
import { buildTablePayload, buildResultPayload } from './presentation.mjs';
import { updateTableCard, postOrEditNotice, announce, notifyAutoKick } from './messages.mjs';
import { removeUnderBBSeats, scheduleEmptyClose } from './table-maintenance.mjs';
import { createHoldemHand, escrowReturn, escrowCommit, persistHandResult, getEscrowBalance } from './persistence.mjs';

async function initializeHand(state) {
  if (state.closeTimer) clearTimeout(state.closeTimer);
  state.closeTimer = null;
  state.closeDeadline = null;
  state.closeMode = null;
  state.handNo = (state.handNo || 0) + 1;
  state.board = [];
  state.burned = [];
  state.pot = 0;
  try {
    const handDbId = await createHoldemHand(state.channelId, state.handNo, '', '[]', 0);
    if (state.closed) return false;
    state.handDbId = handDbId;
  } catch (error) {
    console.error('holdem hand creation error:', error);
  }
  if (state.closed) return false;
  state.deck = makeDeck();
  state.phase = 'PREFLOP';
  return true;
}

function resetSeatsForHand(state) {
  for (const seat of state.seats) {
    seat.inHand = true;
    seat.committed = 0;
    seat.betRound = 0;
    seat.folded = false;
    seat.allIn = false;
  }
}

async function postBlinds(state, sbIndex, bbIndex) {
  const post = async (index, amount, label) => {
    const seat = state.seats[index];
    if (!seat?.inHand || state.closed) return null;
    const pay = Math.min(amount, seat.stack);
    seat.stack -= pay;
    seat.committed += pay;
    seat.betRound += pay;
    state.pot += pay;
    try {
      await escrowCommit(state.channelId, seat.userId, state.handDbId, 'PREFLOP', pay);
    } catch (error) {
      console.error('holdem blind commit error:', error);
    }
    if (pay < amount) seat.allIn = true;
    return `${label} <@${seat.userId}> ${pay}`;
  };
  return (await Promise.all([
    post(sbIndex, state.sb, 'SB'),
    post(bbIndex, state.bb, 'BB')
  ])).filter(Boolean);
}

function dealHoleCards(state) {
  for (const seat of state.seats) {
    if (!seat.inHand) continue;
    seat.hole = [state.deck.pop(), state.deck.pop()];
  }
}

function initializeBetting(state) {
  state.currentBet = state.bb;
  state.minRaise = state.bb;
  state.needAction = state.seats
    .map((_, index) => index)
    .filter(index => state.seats[index].inHand && !state.seats[index].folded);
}

export function clearActionTimer(state) {
  try { if (state.actionTimer) { clearTimeout(state.actionTimer); state.actionTimer = null; } } catch {}
  try { if (state.warningTimer) { clearTimeout(state.warningTimer); state.warningTimer = null; } } catch {}
  state.actionUserId = null; state.actionDeadline = null;
}

export function armActionTimer(client, state, ms = 30000) {
  if (state.closed) return;
  try { if (!Number.isInteger(state.toAct)) { clearActionTimer(state); return; } } catch {}
  const seat = state.seats[state.toAct];
  if (!seat || seat.folded || !seat.inHand) { clearActionTimer(state); return; }
  state.actionUserId = seat.userId;
  state.actionDeadline = Date.now() + ms;
  try { if (state.actionTimer) clearTimeout(state.actionTimer); } catch {}
  // Send immediate turn notice in the table channel (single message reused)
  (async () => {
    try {
      const ts = Math.floor(state.actionDeadline / 1000);
      await postOrEditNotice(client, state, `${emoji('alarmClock')} <@${state.actionUserId}>, it's your turn to act • <t:${ts}:R>`);
    } catch {}
  })();
  // Schedule 10-second warning
  try { if (state.warningTimer) clearTimeout(state.warningTimer); } catch {}
  const warningTimer = setTimeout(async () => {
    try {
      if (state.closed || state.warningTimer !== warningTimer) return;
      if (!state || !Number.isInteger(state.toAct)) return;
      const cur = state.seats[state.toAct];
      if (!cur || cur.userId !== state.actionUserId) return;
      const ts = Math.floor(state.actionDeadline / 1000);
      await postOrEditNotice(client, state, `${emoji('hourglassFlow')} <@${state.actionUserId}> 10 seconds left to act • <t:${ts}:R>`);
    } catch {}
  }, Math.max(0, ms - 10000));
  state.warningTimer = warningTimer;
  const actionTimer = setTimeout(async () => {
    try {
      if (state.closed || state.actionTimer !== actionTimer) return;
      if (!state || !Number.isInteger(state.toAct)) return;
      const cur = state.seats[state.toAct];
      if (!cur || cur.userId !== state.actionUserId) return;
      await doFold(state);
      if (state.closed) return;
      const result = afterActionMaybeAdvance(state);
      if (state.phase === 'COMPLETE' && result) {
        try { await updateTableCard(client, state, buildResultPayload(state, result)); } catch {}
        scheduleNextHand(client, state, result, 10000).catch(() => {});
      } else {
        try { armActionTimer(client, state, 30000); } catch {}
        try { await updateTableCard(client, state); } catch {}
      }
    } catch {}
  }, ms);
  state.actionTimer = actionTimer;
}

export async function startHandAuto(client, state) {
  try {
    if (!state || state.closed) return;
    // Auto-kick players who cannot cover the BB before starting a new hand
    const removed = removeUnderBBSeats(state);
    if (removed.length) { await notifyAutoKick(client, state, removed); await updateTableCard(client, state); }
    if (state.closed) return;
    if (state.seats.length < 2) {
      state.phase = 'LOBBY';
      state.board = [];
      state.pot = 0;
      state.toAct = null;
      if (state?.seats?.length === 1) state.hostId = state.seats[0].userId;
      await updateTableCard(client, state, buildTablePayload(state, `${emoji('chair')} Waiting for players…`));
      if (state?.seats?.length === 0) { try { scheduleEmptyClose(client, state); } catch {} }
      return;
    }
    if (!(await initializeHand(state))) return;
    // Rotate button
    state.buttonIndex = state.seats.length ? firstActiveAfter(state, (state.buttonIndex ?? -1)) ?? ((state.buttonIndex ?? -1) + 1) % state.seats.length : 0;
    // Reset seats
    resetSeatsForHand(state);
    // Post blinds
    const sbIndex = firstActiveAfter(state, state.buttonIndex ?? 0) ?? 0;
    const bbIndex = firstActiveAfter(state, sbIndex) ?? 0;
    // Enforce wait-for-BB sitout until BB
    state.seats.forEach((s, i) => { if (s.waitForBB && i !== bbIndex) { s.inHand = false; s.actedRound = true; } });
    // Apply sit-out: do not deal, and count missed BBs; auto-leave after two missed BBs
    const toRemove = [];
    state.seats.forEach((s, i) => {
      if (s.sitOut) {
        s.inHand = false; s.actedRound = true;
        if (i === bbIndex) {
          s.missedBlinds = (s.missedBlinds || 0) + 1;
          if (s.missedBlinds >= 2) toRemove.push(i);
        }
      }
    });
    if (toRemove.length) {
      // Remove from highest index to lowest to avoid reindex issues
      const sorted = [...toRemove].sort((a, b) => b - a);
      for (const i of sorted) {
        try {
          const removed = state.seats[i];
          if (removed?.userId) {
            try {
              const bal = Number(await getEscrowBalance(state.channelId, removed.userId) || 0);
              if (bal > 0) await escrowReturn(state.channelId, removed.userId, bal);
            } catch {}
          }
          const seat = state.seats.splice(i, 1)[0];
          if (seat) announce(interaction.client, state, `${emoji('noEntry')} <@${seat.userId}> removed after missing two big blinds.`);
        } catch {}
      }
    }
    if (state.seats[bbIndex]?.waitForBB) { try { state.seats[bbIndex].waitForBB = false; } catch {} }
    const postLines = await postBlinds(state, sbIndex, bbIndex);
    if (state.closed) return;
    dealHoleCards(state);
    state.toAct = firstActiveAfter(state, bbIndex);
    initializeBetting(state);
    try { armActionTimer(client, state, 30000); } catch {}
    const toPing = state.seats[state.toAct]?.userId;
    const payload = buildTablePayload(state, `${emoji('playButton')} Hand #${state.handNo} started. ${postLines.join(' • ')}. <@${toPing}> to act.\n• Use "Peek Hand" to view your cards (ephemeral).`);
    await updateTableCard(client, state, payload);
  } catch (e) { /* noop */ }
}

export async function scheduleNextHand(client, state, result, ms = 10000) {
  if (state.closed) return;
  try { if (state.nextHandTimer) { clearTimeout(state.nextHandTimer); state.nextHandTimer = null; } } catch {}
  // Show result-only embed for ms milliseconds
  try { updateTableCard(client, state, buildResultPayload(state, result)); } catch {}
  // Log rake if present
  try {
    if (Number.isFinite(result?.rake) && result.rake > 0) {
      const fmt = new Intl.NumberFormat('en-US');
      const anyUser = (state.seats.find(s => s?.userId)?.userId) || state.hostId || '0';
      state.houseRakeTotal = (state.houseRakeTotal || 0) + Math.trunc(result.rake);
      postGameLogByIds(client, state.guildId, anyUser, [
        `♣ Holdem Rake: **${fmt.format(result.rake)}**`,
        `Table: <#${state.msgChannelId || state.channelId}>`
      ]);
    }
  } catch {}
  await persistHandResult(state, result);
  if (state.closed) return;
  const nextHandTimer = setTimeout(() => {
    if (state.closed || state.nextHandTimer !== nextHandTimer) return;
    return startHandAuto(client, state).finally(() => {
      if (state.nextHandTimer === nextHandTimer) state.nextHandTimer = null;
    });
  }, ms);
  state.nextHandTimer = nextHandTimer;
}

export async function startHand(interaction, ctx) {
  const state = ensureTableInChannel(interaction.guild.id, interaction.channelId);
  if (!state) return interaction.reply({ content: '❌ No table here.', ephemeral: true });
  syncKittenPersona(state, ctx);
  if (interaction.user.id !== state.hostId) return interaction.reply({ content: '❌ Only the host can start hands for now.', ephemeral: true });
  // Acknowledge early to avoid timeouts if triggered by a button
  try {
    if (interaction.isButton && interaction.isButton() && !(interaction.deferred || interaction.replied)) {
      await interaction.deferUpdate();
    }
  } catch {}
  // Kick players who cannot cover the BB before starting (manual)
  const removed = removeUnderBBSeats(state);
  if (removed.length) {
    try {
      await notifyAutoKick(interaction.client, state, removed);
      await updateTableCard(interaction.client, state);
    } catch {}
  }
  if (state.seats.length < 2) return interaction.reply({ content: '❌ Need at least 2 players.', ephemeral: true });
  if (!(await initializeHand(state))) return;
  // Rotate button
  state.buttonIndex = state.seats.length ? nextIndex(state.seats, state.buttonIndex) : 0;
  // Reset seats
  resetSeatsForHand(state);
  // Post blinds
  const sbIndex = nextIndex(state.seats, state.buttonIndex);
  const bbIndex = nextIndex(state.seats, sbIndex);
  // Enforce wait-for-BB: players marked waitForBB sit out until their BB
  state.seats.forEach((s, i) => { if (s.waitForBB && i !== bbIndex) { s.inHand = false; s.actedRound = true; } });
  // Apply sit-out: do not deal, and count missed BBs; auto-leave after two missed BBs
  const toRemove = [];
  state.seats.forEach((s, i) => {
    if (s.sitOut) {
      s.inHand = false; s.actedRound = true;
      if (i === bbIndex) {
        s.missedBlinds = (s.missedBlinds || 0) + 1;
        if (s.missedBlinds >= 2) toRemove.push(i);
      }
    }
  });
  if (toRemove.length) { toRemove.sort((a,b)=>b-a).forEach(i => { try { const r = state.seats.splice(i,1)[0]; if (r) announce(interaction.client, state, `${emoji('noEntry')} <@${r.userId}> removed after missing two big blinds.`); } catch {} }); }
  if (state.seats[bbIndex]?.waitForBB) { try { state.seats[bbIndex].waitForBB = false; } catch {} }
  const postLines = await postBlinds(state, sbIndex, bbIndex);
  if (state.closed) return;
  dealHoleCards(state);
  // First to act preflop: seat after BB
  state.toAct = nextIndex(state.seats, bbIndex);
  initializeBetting(state);
  // Waiting for actions to complete this round
  // Arm action timer
  try { armActionTimer(interaction.client, state, 30000); } catch {}
  const toPing = state.seats[state.toAct]?.userId;
  const payload = buildTablePayload(state, `${emoji('playButton')} Hand #${state.handNo} started. ${postLines.join(' • ')}. <@${toPing}> to act.\n• Use "Peek Hand" to view your cards (ephemeral).`);
  if (interaction.isButton && interaction.isButton()) {
    if (interaction.deferred || interaction.replied) {
      try { return await interaction.editReply(payload); } catch {}
      try { await updateTableCard(interaction.client, state, payload); } catch {}
      return;
    } else {
      try { return await interaction.update(payload); } catch {}
      try { await updateTableCard(interaction.client, state, payload); } catch {}
      return;
    }
  }
  // Slash command path: edit main table card, then ack ephemerally
  await updateTableCard(interaction.client, state, payload);
  return interaction.reply({ content: `${emoji('playButton')} Hand started.`, ephemeral: true });
}
