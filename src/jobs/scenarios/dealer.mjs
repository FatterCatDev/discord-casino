import crypto from 'node:crypto';
import { emoji } from '../../lib/emojis.mjs';

const SUIT_TEMPLATES = ['♠', '♥', '♦', '♣'];
const SUIT_PERMUTATIONS = [
  { char: 'S', key: 'pokerSpade' },
  { char: 'H', key: 'pokerHeart' },
  { char: 'D', key: 'pokerDiamond' },
  { char: 'C', key: 'pokerClub' }
];

const RANK_SEQUENCE = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

const RANK_TO_VALUE = Object.fromEntries(RANK_SEQUENCE.map((rank, idx) => [rank, idx + 2]));
const VALUE_TO_RANK = Object.fromEntries(Object.entries(RANK_TO_VALUE).map(([rank, value]) => [value, rank]));

const RANK_NAMES = {
  14: 'Ace',
  13: 'King',
  12: 'Queen',
  11: 'Jack',
  10: 'Ten',
  9: 'Nine',
  8: 'Eight',
  7: 'Seven',
  6: 'Six',
  5: 'Five',
  4: 'Four',
  3: 'Three',
  2: 'Two'
};

const RANK_PLURALS = {
  14: 'Aces',
  13: 'Kings',
  12: 'Queens',
  11: 'Jacks',
  10: 'Tens',
  9: 'Nines',
  8: 'Eights',
  7: 'Sevens',
  6: 'Sixes',
  5: 'Fives',
  4: 'Fours',
  3: 'Threes',
  2: 'Twos'
};

const CATEGORY_NAMES = {
  8: 'Straight Flush',
  7: 'Four of a Kind',
  6: 'Full House',
  5: 'Flush',
  4: 'Straight',
  3: 'Three of a Kind',
  2: 'Two Pair',
  1: 'One Pair',
  0: 'High Card'
};

const DEALER_OPTIONS = [
  { id: 'A', label: 'Seat A' },
  { id: 'B', label: 'Seat B' },
  { id: 'C', label: 'Seat C' },
  { id: 'AB', label: 'Seats A + B split' },
  { id: 'AC', label: 'Seats A + C split' },
  { id: 'BC', label: 'Seats B + C split' },
  { id: 'ABC', label: 'All seats split' }
];

const STANDARD_DECK_TOKENS = (() => {
  const cards = [];
  for (const suit of SUIT_TEMPLATES) {
    for (const rank of RANK_SEQUENCE) {
      cards.push(`${rank}${suit}`);
    }
  }
  return cards;
})();

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function parseToken(token) {
  const suit = token[token.length - 1];
  const rank = token.slice(0, -1);
  return { rank, suit };
}

function createSuitMap() {
  const permutation = shuffle(SUIT_PERMUTATIONS);
  const map = new Map();
  for (let i = 0; i < SUIT_TEMPLATES.length; i += 1) {
    map.set(SUIT_TEMPLATES[i], permutation[i]);
  }
  return map;
}

function mapCard(token, rankMap, suitMap) {
  const { rank, suit } = parseToken(token);
  const mappedRank = rankMap.get(rank);
  const suitInfo = suitMap.get(suit);
  return {
    rank: mappedRank,
    value: RANK_TO_VALUE[mappedRank],
    suit: suitInfo.char,
    suitKey: suitInfo.key,
    label: `${mappedRank}${emoji(suitInfo.key)}`
  };
}

function detectStraight(values) {
  if (values.length < 5) return null;
  const uniqueDesc = Array.from(new Set(values)).sort((a, b) => b - a);
  if (uniqueDesc.length < 5) return null;
  const extended = uniqueDesc.slice();
  if (uniqueDesc.includes(14)) extended.push(1);
  for (let i = 0; i <= extended.length - 5; i += 1) {
    const start = extended[i];
    let valid = true;
    for (let j = 1; j < 5; j += 1) {
      if (extended[i + j] !== start - j) {
        valid = false;
        break;
      }
    }
    if (valid) {
      return start === 14 && extended[i + 1] === 5 ? 5 : start;
    }
  }
  return null;
}

function findValuesWithCount(counts, min) {
  return Array.from(counts.entries())
    .filter(([, count]) => count >= min)
    .map(([value]) => value)
    .sort((a, b) => b - a);
}

function findValueWithCount(counts, target) {
  const values = findValuesWithCount(counts, target);
  return values.length ? values[0] : null;
}

function evaluateCombination(cards) {
  const counts = new Map();
  const suits = new Map();
  for (const card of cards) {
    counts.set(card.value, (counts.get(card.value) || 0) + 1);
    if (!suits.has(card.suit)) suits.set(card.suit, []);
    suits.get(card.suit).push(card.value);
  }

  const sortedValuesDesc = cards.map(card => card.value).sort((a, b) => b - a);
  const uniqueValuesDesc = Array.from(new Set(sortedValuesDesc));
  const straightHigh = detectStraight(uniqueValuesDesc);

  let flushInfo = null;
  for (const [suit, values] of suits.entries()) {
    if (values.length >= 5) {
      const sortedFlush = values.slice().sort((a, b) => b - a);
      flushInfo = { suit, values: sortedFlush };
      break;
    }
  }

  let straightFlushHigh = null;
  if (flushInfo) {
    const uniqueFlushValues = Array.from(new Set(flushInfo.values));
    straightFlushHigh = detectStraight(uniqueFlushValues);
  }
  if (straightFlushHigh) {
    return { category: 8, rankScore: [8, straightFlushHigh], primary: straightFlushHigh, secondary: null, kickers: [] };
  }

  const quadValue = findValueWithCount(counts, 4);
  if (quadValue) {
    const kicker = sortedValuesDesc.find(v => v !== quadValue);
    return { category: 7, rankScore: [7, quadValue, kicker], primary: quadValue, secondary: null, kickers: [kicker] };
  }

  const tripValues = findValuesWithCount(counts, 3);
  const pairValues = findValuesWithCount(counts, 2);
  if (tripValues.length >= 1) {
    const triple = tripValues[0];
    const remainingTrips = tripValues.slice(1);
    const pairCandidates = remainingTrips.concat(pairValues.filter(v => v !== triple));
    if (pairCandidates.length >= 1) {
      const pairValue = pairCandidates[0];
      return { category: 6, rankScore: [6, triple, pairValue], primary: triple, secondary: pairValue, kickers: [] };
    }
  }

  if (flushInfo) {
    const topFive = flushInfo.values.slice(0, 5);
    return { category: 5, rankScore: [5, ...topFive], primary: topFive[0], secondary: null, kickers: topFive };
  }

  if (straightHigh) {
    return { category: 4, rankScore: [4, straightHigh], primary: straightHigh, secondary: null, kickers: [] };
  }

  if (tripValues.length >= 1) {
    const triple = tripValues[0];
    const kickers = sortedValuesDesc.filter(v => v !== triple).slice(0, 2);
    return { category: 3, rankScore: [3, triple, ...kickers], primary: triple, secondary: null, kickers };
  }

  if (pairValues.length >= 2) {
    const highPair = pairValues[0];
    const lowPair = pairValues[1];
    const kicker = sortedValuesDesc.find(v => v !== highPair && v !== lowPair);
    return { category: 2, rankScore: [2, highPair, lowPair, kicker], primary: highPair, secondary: lowPair, kickers: [kicker] };
  }

  if (pairValues.length >= 1) {
    const pairValue = pairValues[0];
    const kickers = sortedValuesDesc.filter(v => v !== pairValue).slice(0, 3);
    return { category: 1, rankScore: [1, pairValue, ...kickers], primary: pairValue, secondary: null, kickers };
  }

  const highCards = sortedValuesDesc.slice(0, 5);
  return { category: 0, rankScore: [0, ...highCards], primary: highCards[0], secondary: null, kickers: highCards };
}

function compareEvaluations(a, b) {
  const len = Math.max(a.rankScore.length, b.rankScore.length);
  for (let i = 0; i < len; i += 1) {
    const av = a.rankScore[i] ?? 0;
    const bv = b.rankScore[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function determineWinners(evaluations) {
  let bestEval = evaluations[0];
  const winners = [0];
  for (let i = 1; i < evaluations.length; i += 1) {
    const cmp = compareEvaluations(evaluations[i], bestEval);
    if (cmp > 0) {
      bestEval = evaluations[i];
      winners.splice(0, winners.length, i);
    } else if (cmp === 0) {
      winners.push(i);
    }
  }
  return winners;
}

function winnersToOption(winners) {
  const letters = ['A', 'B', 'C'];
  const codes = winners.map(index => letters[index]).sort();
  if (codes.length === 1) return codes[0];
  if (codes.length === 2) return codes.join('');
  return 'ABC';
}

function valueToShort(value) {
  return VALUE_TO_RANK[value];
}

function describeEvaluation(evaluation) {
  const name = CATEGORY_NAMES[evaluation.category];
  switch (evaluation.category) {
    case 8:
      return `${name} (${valueToShort(evaluation.primary)} high)`;
    case 7:
      return `${name} (${RANK_PLURALS[evaluation.primary]} with ${valueToShort(evaluation.kickers[0])} kicker)`;
    case 6:
      return `${name} (${RANK_PLURALS[evaluation.primary]} over ${RANK_PLURALS[evaluation.secondary]})`;
    case 5:
      return `${name} (${evaluation.kickers.map(valueToShort).join(' ')} high)`;
    case 4:
      return `${name} (${valueToShort(evaluation.primary)} high)`;
    case 3:
      return `${name} (${RANK_PLURALS[evaluation.primary]} with kickers ${evaluation.kickers.map(valueToShort).join(' ')})`;
    case 2:
      return `${name} (${RANK_PLURALS[evaluation.primary]} and ${RANK_PLURALS[evaluation.secondary]}, kicker ${valueToShort(evaluation.kickers[0])})`;
    case 1:
      return `${name} (${RANK_PLURALS[evaluation.primary]}, kickers ${evaluation.kickers.map(valueToShort).join(' ')})`;
    default:
      return `${name} (${evaluation.kickers.map(valueToShort).join(' ')} high)`;
  }
}

function buildDetails(winners, evaluations) {
  const seatLetters = ['A', 'B', 'C'];
  const winnerSeats = winners.map(index => `Seat ${seatLetters[index]}`);
  const winnerText = winners.length === 1
    ? winnerSeats[0]
    : winners.length === 2
      ? winnerSeats.join(' and ')
      : 'Seats A, B, and C';
  const verb = winners.length === 1 ? 'wins' : 'split the pot';
  const description = describeEvaluation(evaluations[winners[0]]);
  return `${winnerText} ${verb} with ${description}.`;
}

function createPrompt(board, hands) {
  return [
    `Board: ${board}`,
    `Seat A: ${hands[0]}`,
    `Seat B: ${hands[1]}`,
    `Seat C: ${hands[2]}`,
    'Who wins?'
  ].join('\n');
}

function determineStageDifficulty(evaluation) {
  if (!evaluation) return 'medium';
  if (evaluation.category >= 7) return 'hard';
  if (evaluation.category >= 4) return 'medium';
  return 'easy';
}

function createRandomDealerStage(index) {
  const deck = shuffle(STANDARD_DECK_TOKENS);
  const drawCard = () => deck.pop();

  const boardTokens = Array.from({ length: 5 }, () => drawCard());
  const handsTokens = Array.from({ length: 3 }, () => [drawCard(), drawCard()]);

  const suitMap = createSuitMap();
  const rankMap = new Map(RANK_SEQUENCE.map(rank => [rank, rank]));

  const boardCards = boardTokens.map(token => mapCard(token, rankMap, suitMap));
  const handCards = handsTokens.map(hand => hand.map(token => mapCard(token, rankMap, suitMap)));

  const evaluations = handCards.map(hand => evaluateCombination(hand.concat(boardCards)));
  const winners = determineWinners(evaluations);
  const correct = winnersToOption(winners);

  const boardString = boardCards.map(card => card.label).join(' ');
  const handStrings = handCards.map(hand => hand.map(card => card.label).join(' '));

  const bestEvaluation = evaluations[winners[0]];
  const categoryName = CATEGORY_NAMES[bestEvaluation.category] || 'High Card';
  const difficulty = determineStageDifficulty(bestEvaluation);

  return {
    id: `dealer-random-${crypto.randomUUID()}`,
    title: `Table ${index + 1}: ${categoryName}`,
    difficulty,
    prompt: createPrompt(boardString, handStrings),
    options: DEALER_OPTIONS,
    correct,
    details: buildDetails(winners, evaluations)
  };
}

export function generateDealerStages(count = 5) {
  const stages = [];
  for (let i = 0; i < count; i += 1) {
    stages.push(createRandomDealerStage(i));
  }
  return stages;
}

export default generateDealerStages;
