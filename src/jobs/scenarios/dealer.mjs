import crypto from 'node:crypto';
import { emoji } from '../../lib/emojis.mjs';

const SUITS = {
  club: emoji('pokerClub'),
  diamond: emoji('pokerDiamond'),
  heart: emoji('pokerHeart'),
  spade: emoji('pokerSpade')
};

const STAGES = [
  {
    id: 'board-straight-vs-pair',
    title: 'Warm-Up Table',
    prompt: `Board: 8${SUITS.club} 9${SUITS.diamond} T${SUITS.spade} J${SUITS.heart} 2${SUITS.club}
Hand A: Q${SUITS.club} K${SUITS.diamond}
Hand B: T${SUITS.diamond} T${SUITS.heart}
Hand C: A${SUITS.spade} 4${SUITS.spade}

Who takes the pot?`,
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
    prompt: `Board: 5${SUITS.club} 5${SUITS.diamond} K${SUITS.spade} K${SUITS.heart} 9${SUITS.spade}
Hand A: A${SUITS.club} 9${SUITS.diamond}
Hand B: T${SUITS.club} T${SUITS.diamond}
Hand C: K${SUITS.diamond} Q${SUITS.diamond}

Who wins?`,
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
    prompt: `Board: 2${SUITS.spade} 7${SUITS.spade} T${SUITS.spade} J${SUITS.spade} K${SUITS.diamond}
Hand A: Q${SUITS.spade} 9${SUITS.club}
Hand B: K${SUITS.club} K${SUITS.heart}
Hand C: A${SUITS.club} Q${SUITS.diamond}

Which outcome is correct?`,
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
    prompt: `Board: A${SUITS.diamond} 2${SUITS.club} 3${SUITS.heart} 9${SUITS.club} K${SUITS.spade}
Hand A: 4${SUITS.spade} 5${SUITS.spade}
Hand B: Q${SUITS.diamond} Q${SUITS.club}
Hand C: A${SUITS.club} 9${SUITS.diamond}

Call the winner.`,
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
    prompt: `Board: 9${SUITS.club} T${SUITS.diamond} J${SUITS.club} Q${SUITS.heart} K${SUITS.club}
Hand A: A${SUITS.spade} 2${SUITS.spade}
Hand B: A${SUITS.diamond} 9${SUITS.diamond}
Hand C: 5${SUITS.club} 5${SUITS.diamond}

Who wins?`,
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
    prompt: `Board: 4${SUITS.heart} 7${SUITS.heart} 9${SUITS.heart} Q${SUITS.heart} 2${SUITS.club}
Hand A: A${SUITS.heart} 5${SUITS.club}
Hand B: K${SUITS.heart} T${SUITS.heart}
Hand C: Q${SUITS.spade} Q${SUITS.club}

Decide the outcome.`,
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
    prompt: `Board: T${SUITS.spade} T${SUITS.diamond} 6${SUITS.club} 6${SUITS.spade} 6${SUITS.diamond}
Hand A: T${SUITS.heart} K${SUITS.heart}
Hand B: 6${SUITS.heart} 2${SUITS.heart}
Hand C: A${SUITS.diamond} A${SUITS.club}

Who takes the last pot?`,
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
