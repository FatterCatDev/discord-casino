import { evaluate7, compareHands } from './evaluation.mjs';

export function endHandToWinner(state, winnerIdx, note = 'Everyone else folded') {
  const w = state.seats[winnerIdx];
  const amount = state.pot || 0;
  w.stack += amount; state.pot = 0; state.phase = 'COMPLETE';
  return { winners: [winnerIdx], label: `Hand ends — ${note}`, payouts: [{ idx: winnerIdx, amount }] };
}

export function showdown(state) {
  // Build side pots from total committed amounts
  const players = state.seats.map((s, i) => ({ i, s, committed: Math.max(0, s.committed || 0), folded: !!s.folded, inHand: !!s.inHand }));
  const remaining = players.map(p => ({ i: p.i, amt: p.committed }));
  const pots = [];
  // Create layered pots (main pot first, then side pots)
  while (true) {
    const contributors = remaining.filter(r => r.amt > 0);
    if (contributors.length === 0) break;
    const minAmt = Math.min(...contributors.map(r => r.amt));
    const amount = contributors.reduce((sum, r) => sum + minAmt, 0);
    const eligibles = contributors.map(r => r.i).filter(i => players[i].inHand && !players[i].folded);
    pots.push({ amount, eligibles });
    for (const r of contributors) r.amt -= minAmt;
  }
  // Apply rake (from total pot) before distribution
  let totalPot = pots.reduce((s,p)=>s+(p.amount||0),0);
  let rake = 0;
  try {
    const bps = Math.max(0, Number(state.rakeBps||0));
    const cap = Math.max(0, Number(state.rakeCap||0));
    if (bps > 0 && totalPot > 0) {
      rake = Math.floor(totalPot * bps / 10000);
      if (cap > 0) rake = Math.min(rake, cap);
      let remaining = rake;
      for (let i=0;i<pots.length && remaining>0;i++) { const take = Math.min(pots[i].amount, remaining); pots[i].amount -= take; remaining -= take; }
      totalPot -= rake;
    }
  } catch {}
  // Evaluate hands cache
  const evalCache = new Map();
  const evalFor = (i) => {
    if (evalCache.has(i)) return evalCache.get(i);
    const res = evaluate7([...(state.seats[i].hole || []), ...(state.board || [])]);
    evalCache.set(i, res);
    return res;
  };
  // Distribute each pot and capture per-pot winners
  const payoutMap = new Map(); // idx -> amount
  const potResults = [];
  for (let pi = 0; pi < pots.length; pi++) {
    const pot = pots[pi];
    const elig = pot.eligibles;
    if (!elig || elig.length === 0) continue;
    let bestIdx = []; let bestRes = null;
    for (const i of elig) {
      const r = evalFor(i);
      if (!bestRes || compareHands(r, bestRes) > 0) { bestRes = r; bestIdx = [i]; }
      else if (compareHands(r, bestRes) === 0) { bestIdx.push(i); }
    }
    const share = Math.floor(pot.amount / bestIdx.length);
    let remainder = pot.amount - share * bestIdx.length;
    const winnersArr = [];
    let oddIdx = bestIdx[0];
    try {
      const set = new Set(bestIdx);
      const n = state.seats.length;
      const start = (state.buttonIndex ?? -1) + 1;
      for (let step = 0; step < n; step++) { const idx = (start + step) % n; if (set.has(idx)) { oddIdx = idx; break; } }
    } catch {}
    bestIdx.forEach((i) => {
      const add = share + (remainder > 0 && i === oddIdx ? 1 : 0);
      if (remainder > 0 && i === oddIdx) remainder -= 1;
      payoutMap.set(i, (payoutMap.get(i) || 0) + add);
      winnersArr.push({ idx: i, amount: add });
    });
    potResults.push({ amount: pot.amount, winners: winnersArr });
  }
  // Apply payouts to stacks
  const payouts = [];
  for (const [idx, amt] of payoutMap.entries()) {
    state.seats[idx].stack = (state.seats[idx].stack || 0) + amt;
    payouts.push({ idx, amount: amt });
  }
  // Overall best for label readability
  const activeIdx = players.filter(p => p.inHand && !p.folded).map(p => p.i);
  const overall = activeIdx.map(i => ({ idx: i, res: evalFor(i) })).sort((A,B)=>compareHands(A.res,B.res)).reverse();
  const bestOverall = overall[0]?.res;
  const topIdx = overall.filter(x => compareHands(x.res, bestOverall) === 0).map(x => x.idx);
  const labels = topIdx.map(i => `<@${state.seats[i].userId}>`).join(', ');
  const label = `Showdown — ${labels}${topIdx.length>1?' (split)':''}`;
  state.pot = 0; state.phase = 'COMPLETE';
  return { winners: topIdx, label: bestOverall ? `${label} • ${bestOverall.label}` : label, payouts, pots: potResults, rake };
}

export function refundUncalledBet(state) {
  try {
    // Consider only active (in-hand, not folded) players
    const actives = state.seats
      .map((s, i) => ({ i, s }))
      .filter(x => x.s && x.s.inHand && !x.s.folded);
    if (actives.length === 0) return 0;
    // Find leader by current round contribution
    let leader = actives[0];
    for (const x of actives) { if ((x.s.betRound || 0) > (leader.s.betRound || 0)) leader = x; }
    const leaderAmt = leader.s.betRound || 0;
    if (leaderAmt <= 0) return 0;
    // Highest matched amount among other actives
    let otherMax = 0;
    for (const x of actives) { if (x.i === leader.i) continue; otherMax = Math.max(otherMax, x.s.betRound || 0); }
    if (otherMax >= leaderAmt) return 0;
    const refund = leaderAmt - otherMax;
    // Apply refund: reduce pot, return to stack, lower displayed betRound to matched
    leader.s.betRound = otherMax;
    state.pot = Math.max(0, (state.pot || 0) - refund);
    leader.s.stack = (leader.s.stack || 0) + refund;
    leader.s.committed = Math.max(0, (leader.s.committed || 0) - refund);
    // Also adjust currentBet down to matched amount
    state.currentBet = otherMax;
    return refund;
  } catch { return 0; }
}
