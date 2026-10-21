/**
 * @typedef {object} HoldemSeat
 * @property {string} userId
 * @property {number} stack Uncommitted chips at the table.
 * @property {number} committed Chips committed across this hand.
 * @property {number} betRound Chips committed on this street.
 * @property {boolean} inHand
 * @property {boolean} folded
 * @property {boolean} allIn
 * @property {string[]} hole Cards encoded as rank + suit (for example, T + spade).
 * @property {boolean} [actedRound]
 * @property {boolean} [sitOut]
 * @property {boolean} [waitForBB]
 * @property {number} [missedBlinds]
 * @property {number} [buyInTotal]
 * @property {number} [initialBuyIn]
 * @property {number} [joinedAt] Unix milliseconds.
 * @property {number} [rakeSnapshot]
 */

/**
 * @typedef {object} HoldemTable
 * @property {string} guildId
 * @property {string} channelId
 * @property {string|null} hostId
 * @property {HoldemSeat[]} seats
 * @property {string} phase
 * @property {number} sb Small blind in chips.
 * @property {number} bb Big blind in chips.
 * @property {number} min Minimum buy-in in chips.
 * @property {number} max Maximum buy-in/stack in chips.
 * @property {number} cap Seat limit.
 * @property {number} buttonIndex
 * @property {number|null} toAct
 * @property {number} pot
 * @property {number} [currentBet]
 * @property {number} [minRaise]
 * @property {number} [rakeBps] Basis points.
 * @property {number} [rakeCap] Chips.
 * @property {number} [handNo]
 * @property {number} [handDbId]
 * @property {string[]} deck
 * @property {string[]} board
 * @property {string[]} [burned]
 * @property {boolean} [closed] Stops delayed callbacks after table disposal.
 * @property {ReturnType<typeof setTimeout>|null} [actionTimer]
 * @property {ReturnType<typeof setTimeout>|null} [warningTimer]
 * @property {ReturnType<typeof setTimeout>|null} [hostKickTimer]
 * @property {ReturnType<typeof setTimeout>|null} [closeTimer]
 * @property {ReturnType<typeof setTimeout>|null} [nextHandTimer]
 * @property {ReturnType<typeof setInterval>|null} [nextHandInterval]
 */

/** @type {Map<string, HoldemTable>} */
export const holdemTables = new Map();

export function tableKey(guildId, channelId) { return `${guildId}:${channelId}`; }

export function ensureTableInChannel(guildId, channelId) {
  const k = tableKey(guildId, channelId);
  return holdemTables.get(k) || null;
}

/** @returns {HoldemSeat} */
export function emptySeat(userId, stack = 0) {
  return {
    userId,
    stack,
    inHand: false,
    committed: 0,
    betRound: 0,
    folded: false,
    allIn: false,
    hole: []
  };
}
