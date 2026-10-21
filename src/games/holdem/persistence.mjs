import { escrowCreditMany, settleRake, finalizeHoldemHand } from '../../db/db.auto.mjs';

export {
  getGuildSettings,
  reserveHoldemTableNumber,
  createHoldemHand,
  escrowAdd,
  escrowReturn,
  escrowCommit,
  escrowCreditMany,
  settleRake,
  finalizeHoldemHand,
  getEscrowBalance,
  getUserBalances,
  getHouseBalance
} from '../../db/db.auto.mjs';

/**
 * @typedef {object} HandResult
 * @property {number[]} winners Seat indexes used for the result label.
 * @property {string} label
 * @property {{idx: number, amount: number}[]} payouts
 * @property {{amount: number, winners: {idx: number, amount: number}[]}[]} [pots]
 * @property {number} [rake] Chips.
 */

/**
 * Existing settlement uses separate transactions, not an atomic hand commit.
 * @param {import('./state.mjs').HoldemTable} state
 * @param {HandResult} result
 */
export async function persistHandResult(state, result) {
  const payouts = (result?.payouts || [])
    .map(payout => ({
      userId: state.seats[payout.idx]?.userId,
      amount: Number(payout.amount) || 0
    }))
    .filter(payout => payout.userId && payout.amount > 0);

  try {
    if (payouts.length) await escrowCreditMany(state.channelId, payouts);
    if (Number.isFinite(result?.rake) && result.rake > 0) {
      await settleRake(state.channelId, Number(result.rake) || 0);
    }
    try {
      const board = state.board?.length ? state.board.join(',') : '';
      await finalizeHoldemHand(state.handDbId || 0, {
        board,
        winnersJson: JSON.stringify(payouts),
        rakePaid: Number(result?.rake || 0)
      });
    } catch (error) {
      console.error('holdem hand finalization error:', error);
    }
  } catch (error) {
    console.error('holdem hand settlement error:', error);
  }
}
