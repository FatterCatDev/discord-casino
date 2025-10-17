import crypto from 'node:crypto';

export const JOB_PAYOUT_DIVISOR = 5;

export const JOB_SHIFT_STAGE_COUNT = 5;

// XP thresholds to reach the next rank (Rank 1 -> 2 etc.)
export const XP_THRESHOLDS = [
  100,
  218,
  475,
  1037,
  2261,
  4929,
  10748,
  23435,
  51100
];

export function xpToNextForRank(rank) {
  if (rank >= 10) return 0;
  const idx = Math.max(0, Math.min(XP_THRESHOLDS.length - 1, rank - 1));
  return XP_THRESHOLDS[idx];
}

export function maxPayForRank(rank) {
  if (rank >= 10) return 100000;
  return xpToNextForRank(rank);
}

export function maxBasePayForRank(rank) {
  const maxPay = maxPayForRank(rank);
  if (!Number.isFinite(maxPay) || maxPay <= 0) return 0;
  return Math.floor(maxPay / JOB_PAYOUT_DIVISOR);
}

export function clampPerformance(score) {
  const value = Number(score) || 0;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.floor(value)));
}

export function applyXpGain(profile, gainedXp) {
  const startingRank = Math.max(1, Number(profile?.rank || 1));
  const startingTotal = Math.max(0, Number(profile?.totalXp || profile?.total_xp || 0));
  let xpToNext = Number(profile?.xpToNext ?? profile?.xp_to_next);
  if (!Number.isFinite(xpToNext) || xpToNext <= 0) xpToNext = xpToNextForRank(startingRank);

  let rank = startingRank;
  let totalXp = startingTotal;
  let remainingXp = Math.max(0, Math.floor(Number(gainedXp) || 0));
  let ranksGained = 0;

  while (remainingXp > 0 && rank < 10) {
    if (xpToNext <= 0) xpToNext = xpToNextForRank(rank);
    if (remainingXp < xpToNext) {
      totalXp += remainingXp;
      xpToNext -= remainingXp;
      remainingXp = 0;
      break;
    }
    // Rank up
    totalXp += xpToNext;
    remainingXp -= xpToNext;
    rank += 1;
    ranksGained += 1;
    xpToNext = rank < 10 ? xpToNextForRank(rank) : 0;
  }

  if (rank >= 10) {
    xpToNext = 0;
    totalXp += remainingXp;
    remainingXp = 0;
  } else if (remainingXp > 0) {
    totalXp += remainingXp;
    xpToNext = Math.max(0, xpToNext - remainingXp);
    remainingXp = 0;
  }

  return {
    rank,
    totalXp,
    xpToNext,
    ranksGained,
    xpApplied: Math.max(0, Math.floor(Number(gainedXp) || 0)),
    xpOverflow: remainingXp
  };
}

export function performanceToBasePay(rank, performanceScore) {
  const maxBase = maxBasePayForRank(rank);
  if (maxBase <= 0) return 0;
  const perf = clampPerformance(performanceScore);
  return Math.floor(maxBase * (perf / 100));
}

const TIP_OPTIONS = Array.from({ length: 21 }, (_, percent) => ({
  percent,
  weight: percent <= 15 ? 2 : 1
}));
const TIP_TOTAL_WEIGHT = TIP_OPTIONS.reduce((sum, opt) => sum + opt.weight, 0);

function seededIndexFromBuffer(buffer) {
  let acc = 0;
  const len = Math.min(buffer.length, 6);
  for (let i = 0; i < len; i += 1) {
    acc = (acc << 8) + buffer[i];
  }
  return acc % TIP_TOTAL_WEIGHT;
}

export function rollTipPercent(options = {}) {
  if (TIP_TOTAL_WEIGHT <= 0) return 0;
  let idx;
  if (options && typeof options.random === 'function') {
    const sample = Number(options.random());
    const clamped = Number.isFinite(sample) ? Math.max(0, Math.min(0.999999999, sample)) : Math.random();
    idx = Math.floor(clamped * TIP_TOTAL_WEIGHT);
  } else if (options && (options.seed !== undefined && options.seed !== null)) {
    const hash = crypto.createHash('sha256').update(String(options.seed)).digest();
    idx = seededIndexFromBuffer(hash);
  } else {
    idx = crypto.randomInt(0, TIP_TOTAL_WEIGHT);
  }
  let cursor = 0;
  for (const opt of TIP_OPTIONS) {
    cursor += opt.weight;
    if (idx < cursor) return opt.percent;
  }
  return TIP_OPTIONS[TIP_OPTIONS.length - 1].percent;
}

export function calculateTipAmount(basePay, tipPercent) {
  if (!Number.isFinite(basePay) || basePay <= 0) return 0;
  const pct = Math.max(0, Math.min(100, Math.floor(Number(tipPercent) || 0)));
  return Math.floor(Math.max(0, Math.floor(basePay)) * pct / 100);
}
