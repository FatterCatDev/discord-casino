import crypto from 'node:crypto';

const STAGES = [
  {
    id: 'board-straight-vs-pair',
    title: 'Warm-Up Table',
    prompt: 'Board: 8♣ 9♦ T♠ J♥ 2♣
Hand A: Q♣ K♦
Hand B: T♦ T♥
Hand C: A♠ 4♠

Who takes the pot?',
    options: [
      { id: 'A', label: 'Seat A' },
      { id: 'B', label: 'Seat B' },
      { id: 'C', label: 'Seat C' },
      { id: 'S', label: 'Split Pot' }
    ],
    correct: 'A',
    difficulty: 'easy',
    details: 'Seat A hits the queen-high straight; B only has trips, C has a pair.'
  },
  {
    id: 'board-full-house-split',
    title: 'Full House Showdown',
    prompt: 'Board: 5♣ 5♦ K♠ K♥ 9♠
Hand A: A♣ 9♦
Hand B: T♣ T♦
Hand C: K♦ Q♦

Who wins?',
    options: [
      { id: 'A', label: 'Seat A' },
      { id: 'B', label: 'Seat B' },
      { id: 'C', label: 'Seat C' },
      { id: 'AB', label: 'Seats A + B split' },
      { id: 'AC', label: 'Seats A + C split' },
      { id: 'BC', label: 'Seats B + C split' }
    ],
    correct: 'A',
    difficulty: 'medium',
    details: 'Seat A makes kings full of nines; Seat C only plays the board full house, Seat B holds fives full.'
  },
  {
    id: 'board-flush-beats-straight',
    title: 'Flush Pressure',
    prompt: 'Board: 2♠ 7♠ T♠ J♠ K♦
Hand A: Q♠ 9♣
Hand B: K♣ K♥
Hand C: A♣ Q♦

Which outcome is correct?',
    options: [
      { id: 'A', label: 'Seat A' },
      { id: 'B', label: 'Seat B' },
      { id: 'C', label: 'Seat C' },
      { id: 'ABC', label: 'Three-way chop' }
    ],
    correct: 'A',
    difficulty: 'medium',
    details: 'Seat A holds the queen-high flush; Seat B has a set, Seat C only has ace high.'
  },
  {
    id: 'board-wheel-sneak',
    title: 'Wheel Sneak Attack',
    prompt: 'Board: A♦ 2♣ 3♥ 9♣ K♠
Hand A: 4♠ 5♠
Hand B: Q♦ Q♣
Hand C: A♣ 9♦

Call the winner.',
    options: [
      { id: 'A', label: 'Seat A' },
      { id: 'B', label: 'Seat B' },
      { id: 'C', label: 'Seat C' },
      { id: 'S', label: 'Split Pot' }
    ],
    correct: 'A',
    difficulty: 'hard',
    details: 'Seat A makes the five-high straight (wheel). Seat C has two pair, Seat B has queens.'
  },
  {
    id: 'board-four-card-straight',
    title: 'Split Trap',
    prompt: 'Board: 9♣ T♦ J♣ Q♥ K♣
Hand A: A♠ 2♠
Hand B: A♦ 9♦
Hand C: 5♣ 5♦

Who wins?',
    options: [
      { id: 'A', label: 'Seat A' },
      { id: 'B', label: 'Seat B' },
      { id: 'C', label: 'Seat C' },
      { id: 'AB', label: 'Seats A + B split' },
      { id: 'AC', label: 'Seats A + C split' },
      { id: 'BC', label: 'Seats B + C split' }
    ],
    correct: 'AB',
    difficulty: 'hard',
    details: 'Both Seats A and B play the Broadway straight; Seat C is stuck with the board straight.'
  },
  {
    id: 'board-flush-vs-flush',
    title: 'Flush vs Flush',
    prompt: 'Board: 4♥ 7♥ 9♥ Q♥ 2♣
Hand A: A♥ 5♣
Hand B: K♥ T♥
Hand C: Q♠ Q♣

Decide the outcome.',
    options: [
      { id: 'A', label: 'Seat A' },
      { id: 'B', label: 'Seat B' },
      { id: 'C', label: 'Seat C' },
      { id: 'AB', label: 'Seats A + B split' },
      { id: 'BC', label: 'Seats B + C split' },
      { id: 'ABC', label: 'Three-way chop' }
    ],
    correct: 'B',
    difficulty: 'medium',
    details: 'Seat B holds the king-high flush; Seat A only has ace-high with five kicker, Seat C has a set but no flush.'
  },
  {
    id: 'board-boat-triple',
    title: 'Full Boat Finale',
    prompt: 'Board: T♠ T♦ 6♣ 6♠ 6♦
Hand A: T♥ K♥
Hand B: 6♥ 2♥
Hand C: A♦ A♣

Who takes the last pot?',
    options: [
      { id: 'A', label: 'Seat A' },
      { id: 'B', label: 'Seat B' },
      { id: 'C', label: 'Seat C' },
      { id: 'AB', label: 'Seats A + B split' },
      { id: 'AC', label: 'Seats A + C split' },
      { id: 'BC', label: 'Seats B + C split' }
    ],
    correct: 'B',
    difficulty: 'hard',
    details: 'Seat B holds quads (four sixes). Seat A shows tens full, Seat C has aces full — both lose to quads.'
  }
];

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function generateDealerStages(count = 5) {
  const pool = shuffle(STAGES);
  return pool.slice(0, count);
}

export default generateDealerStages;
