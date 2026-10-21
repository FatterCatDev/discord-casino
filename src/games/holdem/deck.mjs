import crypto from 'node:crypto';

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS = ['♣', '♦', '♥', '♠'];

export function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push(`${rank}${suit}`);
  }
  for (let index = deck.length - 1; index > 0; index--) {
    const swapIndex = crypto.randomInt(index + 1);
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

export function burnAndDeal(state, count) {
  try {
    state.burned = Array.isArray(state.burned) ? state.burned : [];
    const burn = state.deck.pop();
    if (burn) state.burned.push(burn);
  } catch {}
  for (let i = 0; i < count; i++) state.board.push(state.deck.pop());
}
