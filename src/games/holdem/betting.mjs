import { burnAndDeal } from './deck.mjs';
import { endHandToWinner, showdown, refundUncalledBet } from './pots.mjs';

export function firstActiveAfter(state, startIdx) {
  const seatCount = state.seats.length;
  if (!seatCount) return null;
  for (let step = 1; step <= seatCount; step++) {
    const index = (startIdx + step) % seatCount;
    const seat = state.seats[index];
    if (seat && seat.inHand && !seat.folded && !seat.allIn) return index;
  }
  return null;
}

function activeInHand(state) {
  return state.seats.filter(seat => seat.inHand && !seat.folded);
}

function computeNeeders(state) {
  const need = [];
  const cb = state.currentBet || 0;
  state.seats.forEach((s, i) => {
    if (!s.inHand || s.folded || s.allIn) return;
    if (!s.actedRound) { need.push(i); return; }
    if ((s.betRound || 0) < cb) need.push(i);
  });
  return need;
}

function roundIsDone(state) { return computeNeeders(state).length === 0; }

function setToActForStreet(state, street) {
  if (street === 'PREFLOP') {
    // Already set in startHand to seat after BB
    return;
  }
  const afterBtn = firstActiveAfter(state, state.buttonIndex ?? 0);
  state.toAct = afterBtn ?? null;
}

async function advanceStreet(state) {
  if (state.phase === 'PREFLOP') { state.phase = 'FLOP'; state.board = []; burnAndDeal(state, 3); }
  else if (state.phase === 'FLOP') { state.phase = 'TURN'; burnAndDeal(state, 1); }
  else if (state.phase === 'TURN') { state.phase = 'RIVER'; burnAndDeal(state, 1); }
  else { state.phase = 'SHOWDOWN'; }
  // Reset betting for new street (except SHOWDOWN)
  if (state.phase !== 'SHOWDOWN') {
    state.currentBet = 0;
    state.minRaise = state.bb;
    for (const s of state.seats) { if (s.inHand && !s.folded) { s.betRound = 0; s.actedRound = false; } }
    setToActForStreet(state, state.phase);
  }
}

function onlyOneActive(state) {
  let idx = -1; let count = 0;
  for (let i = 0; i < state.seats.length; i++) { const s = state.seats[i]; if (s.inHand && !s.folded) { idx = i; count++; if (count > 1) break; } }
  return count === 1 ? idx : -1;
}

function nextToAct(state) {
  if (!Number.isInteger(state.toAct)) return null;
  const n = state.seats.length; if (!n) return null;
  for (let step = 1; step <= n; step++) {
    const idx = (state.toAct + step) % n; const s = state.seats[idx];
    if (!s || !s.inHand || s.folded || s.allIn) continue;
    // Needs action per our rules
    if (!s.actedRound) return idx;
    if ((s.betRound || 0) < (state.currentBet || 0)) return idx;
  }
  return null;
}

export function afterActionMaybeAdvance(state) {
  // Check early win by folds
  const lone = onlyOneActive(state);
  if (lone !== -1) return endHandToWinner(state, lone);
  // If all remaining are all-in, run out board to showdown
  const actives = activeInHand(state);
  if (actives.length>0 && actives.every(s=>s.allIn)) {
    if (state.phase === 'PREFLOP') { state.board = []; burnAndDeal(state, 3); }
    if (state.phase === 'PREFLOP' || state.phase === 'FLOP') burnAndDeal(state, 1);
    if (state.phase === 'TURN') burnAndDeal(state, 1);
    state.phase = 'SHOWDOWN';
    return showdown(state);
  }
  // If round complete, advance to next street or showdown
  if (roundIsDone(state)) {
    // Return any uncalled portion of the highest bet back to its bettor
    try { refundUncalledBet(state); } catch {}
    if (state.phase === 'RIVER') { state.phase = 'SHOWDOWN'; return showdown(state); }
    advanceStreet(state);
    // After advancing, if only one player can act for the rest of the hand,
    // immediately run out remaining streets to showdown.
    const auto = maybeAutoRunToShowdownIfOnlyOneCanAct(state);
    if (auto) return auto;
  }
  // Set next toAct if still in betting
  if (state.phase !== 'COMPLETE' && state.phase !== 'SHOWDOWN') {
    const nxt = nextToAct(state); if (nxt !== null) state.toAct = nxt;
  }
  return null;
}

function maybeAutoRunToShowdownIfOnlyOneCanAct(state) {
  try {
    const actives = activeInHand(state);
    if (actives.length < 2) return null; // covered by lone-win case elsewhere
    const canAct = actives.filter(s => !s.allIn);
    if (canAct.length <= 1) {
      // Run out remaining streets to showdown
      if (state.phase === 'PREFLOP') { state.board = []; burnAndDeal(state, 3); burnAndDeal(state, 1); burnAndDeal(state, 1); }
      else if (state.phase === 'FLOP') { burnAndDeal(state, 1); burnAndDeal(state, 1); }
      else if (state.phase === 'TURN') { burnAndDeal(state, 1); }
      state.phase = 'SHOWDOWN';
      return showdown(state);
    }
  } catch {}
  return null;
}

export async function doFold(state) {
  const seat = state.seats[state.toAct];
  if (!seat) return;
  seat.folded = true;
  seat.inHand = true;
  seat.actedRound = true;
}

export async function doCheck(state) {
  const seat = state.seats[state.toAct];
  if (!seat) return;
  const needed = Math.max(0, (state.currentBet || 0) - (seat.betRound || 0));
  if (needed > 0) return;
  seat.actedRound = true;
}

export async function doCall(state) {
  const seat = state.seats[state.toAct];
  if (!seat) return;
  const needed = Math.max(0, (state.currentBet || 0) - (seat.betRound || 0));
  const pay = Math.min(needed, seat.stack);
  seat.stack -= pay;
  seat.betRound = (seat.betRound || 0) + pay;
  seat.committed += pay;
  state.pot += pay;
  seat.actedRound = true;
  if (seat.stack === 0) seat.allIn = true;
}

export async function doAllIn(state) {
  const seat = state.seats[state.toAct];
  if (!seat) return;
  const maxPut = seat.stack;
  if (maxPut <= 0) return;
  const target = (seat.betRound || 0) + maxPut;
  const newRaise = target - (state.currentBet || 0);
  seat.stack = 0;
  seat.betRound = target;
  seat.committed += maxPut;
  state.pot += maxPut;
  seat.allIn = true;
  seat.actedRound = true;
  if (newRaise > 0) {
    // Treat as raise (may be a partial raise; we keep minRaise unchanged if partial)
    if (state.currentBet === 0) state.minRaise = maxPut; else state.minRaise = Math.max(state.minRaise, newRaise);
    state.currentBet = target;
  }
}

export async function doBetOrRaise(state, amount) {
  const seat = state.seats[state.toAct];
  if (!seat) return false;
  if (!Number.isInteger(amount) || amount <= 0) return false;
  if (amount >= seat.stack) {
    await doAllIn(state);
    return true;
  }
  const target = (seat.betRound || 0) + amount;
  if ((state.currentBet||0) === 0) {
    // Bet
    if (amount < state.bb) return false; // min open = BB
    seat.stack -= amount;
    seat.betRound = target;
    seat.committed += amount;
    state.pot += amount;
    seat.actedRound = true;
    state.currentBet = target;
    state.minRaise = amount;
    return true;
  } else {
    // Raise
    const needed = (state.currentBet || 0) - (seat.betRound || 0);
    if (amount <= needed) return false; // must exceed a call
    const raiseSize = target - (state.currentBet||0);
    if (raiseSize < state.minRaise) return false; // not a full raise
    seat.stack -= amount;
    seat.betRound = target;
    seat.committed += amount;
    state.pot += amount;
    seat.actedRound = true;
    state.currentBet = target;
    state.minRaise = raiseSize;
    return true;
  }
}

export function nextIndex(arr, i) { return (i + 1) % arr.length; }
