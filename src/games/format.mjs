import { emoji } from '../lib/emojis.mjs';

const CHIP_EMOJI = emoji('chips');

export function formatChips(n) {
  return new Intl.NumberFormat('en-US').format(n);
}

export function chipsAmount(n, options = {}) {
  const { includeLabel = false } = options;
  const base = `${CHIP_EMOJI}${formatChips(n)}`;
  return includeLabel ? `${base} Chips` : base;
}

export function chipsAmountSigned(n, options = {}) {
  const { includeLabel = false } = options;
  const sign = n >= 0 ? '+' : '-';
  const base = chipsAmount(Math.abs(n), { includeLabel });
  return `${sign}${base}`;
}
