import { MG_PER_GRAM, CARTEL_MAX_RANK } from './constants.mjs';

const STASH_CAP_BY_RANK = [100, 175, 275, 400, 600, 850, 1150, 1550, 2000, 2500];
const XP_CURVE_START = 150;
const XP_CURVE_END = 1_210_560;

function buildXpCurve() {
  const steps = Math.max(1, CARTEL_MAX_RANK - 1);
  const ratio = steps > 1 ? Math.pow(XP_CURVE_END / XP_CURVE_START, 1 / (steps - 1)) : 1;
  const values = [];
  for (let idx = 0; idx < steps; idx += 1) {
    if (idx === 0) {
      values.push(XP_CURVE_START);
    } else if (idx === steps - 1) {
      values.push(XP_CURVE_END);
    } else {
      const raw = XP_CURVE_START * (ratio ** idx);
      values.push(Math.max(XP_CURVE_START, Math.round(raw)));
    }
  }
  values.push(0); // Max rank has no further XP requirement.
  return values;
}

const XP_TO_NEXT_BY_RANK = buildXpCurve();

export function stashCapForRank(rank) {
  const idx = Math.min(STASH_CAP_BY_RANK.length - 1, Math.max(1, Number(rank) || 1) - 1);
  return STASH_CAP_BY_RANK[idx];
}

export function stashCapMgForRank(rank) {
  return stashCapForRank(rank) * MG_PER_GRAM;
}

export function xpToNextForRank(rank) {
  const idx = Math.min(XP_TO_NEXT_BY_RANK.length - 1, Math.max(1, Number(rank) || 1) - 1);
  return XP_TO_NEXT_BY_RANK[idx] || 0;
}

export function rankXpTable() {
  let cumulativeXp = 0;
  return Array.from({ length: CARTEL_MAX_RANK }, (_, idx) => {
    const rank = idx + 1;
    const xpToNext = xpToNextForRank(rank);
    const entry = {
      rank,
      xpToNext,
      xpToReach: cumulativeXp,
      stashCap: stashCapForRank(rank)
    };
    cumulativeXp += xpToNext;
    return entry;
  });
}

export function applyRankProgress(rank, rankXp, xpGain = 0) {
  let currentRank = Math.max(1, Math.min(CARTEL_MAX_RANK, Number(rank) || 1));
  let xp = Math.max(0, Number(rankXp) || 0) + Math.max(0, Number(xpGain) || 0);
  while (currentRank < CARTEL_MAX_RANK) {
    const needed = xpToNextForRank(currentRank);
    if (needed <= 0 || xp < needed) break;
    xp -= needed;
    currentRank += 1;
  }
  if (currentRank >= CARTEL_MAX_RANK) {
    currentRank = CARTEL_MAX_RANK;
    xp = 0;
  }
  return { rank: currentRank, rankXp: xp };
}
