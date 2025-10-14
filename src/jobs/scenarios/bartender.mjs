import crypto from 'node:crypto';

const STAGES = [
  {
    id: 'old-fashioned-order',
    title: 'Old Fashioned Rush',
    prompt: 'An Old Fashioned ticket hits the rail. What is the first step to keep the drink balanced?',
    options: [
      { id: 'A', label: 'Muddle a sugar cube with bitters' },
      { id: 'B', label: 'Pour two ounces of bourbon' },
      { id: 'C', label: 'Add the orange twist garnish' },
      { id: 'D', label: 'Pack the rocks glass with ice' }
    ],
    correct: 'A',
    difficulty: 'easy',
    details: 'Sugar and bitters build the base — spirits and garnish come later.'
  },
  {
    id: 'martini-technique',
    title: 'Crystal Clear Martini',
    prompt: 'Your VIP wants a dry gin martini with razor-sharp clarity. Which technique keeps it silky?',
    options: [
      { id: 'A', label: 'Shake hard with ice for aeration' },
      { id: 'B', label: 'Stir gently with chilled barspoon' },
      { id: 'C', label: 'Build directly in the coupe glass' },
      { id: 'D', label: 'Flash blend, then strain' }
    ],
    correct: 'B',
    difficulty: 'medium',
    details: 'Stirring chills without clouding, keeping the martini crystal clear.'
  },
  {
    id: 'vip-double-order',
    title: 'Dual Whiskey Sours',
    prompt: 'Two Whiskey Sours land at once. What keeps both drinks consistent while you multitask?',
    options: [
      { id: 'A', label: 'Split ingredients between two shaking tins evenly' },
      { id: 'B', label: 'Build one completely, then copy it' },
      { id: 'C', label: 'Free pour to save time' },
      { id: 'D', label: 'Add extra sugar to balance melting ice' }
    ],
    correct: 'A',
    difficulty: 'medium',
    details: 'Batching both tins evenly keeps dilution and balance identical.'
  },
  {
    id: 'rush-hour-sub',
    title: 'Rush Hour Substitution',
    prompt: 'You run out of basil mid-service. The guest wants a Basil Smash vibe. What’s the best on-the-fly move?',
    options: [
      { id: 'A', label: 'Swap in mint and adjust with a dry shake' },
      { id: 'B', label: 'Use rosemary and torch for aroma' },
      { id: 'C', label: 'Replace basil with celery salt' },
      { id: 'D', label: 'Add absinthe rinse to distract the flavor shift' }
    ],
    correct: 'A',
    difficulty: 'hard',
    details: 'Mint keeps herbaceous brightness; a dry shake blends oils before ice is added.'
  },
  {
    id: 'signature-double-shake',
    title: 'Signature Ramos Sprint',
    prompt: 'The house Ramos Gin Fizz demands a double shake. Which sequence keeps the foam lush?',
    options: [
      { id: 'A', label: 'Dry shake with egg white, add ice, shake again, long pour' },
      { id: 'B', label: 'Shake once with ice and egg white, strain, top with cream' },
      { id: 'C', label: 'Add seltzer before shaking to stretch the foam' },
      { id: 'D', label: 'Blend all ingredients for 10 seconds, then fine strain' }
    ],
    correct: 'A',
    difficulty: 'hard',
    details: 'Dry shake emulsifies proteins; the second shake with ice chills and aerates before the long pour.'
  },
  {
    id: 'garnish-detail',
    title: 'Garnish Whisperer',
    prompt: 'A French 75 heads to a proposal celebration. Which finishing touch nails the presentation?',
    options: [
      { id: 'A', label: 'Express a lemon twist over the top and clip on the rim' },
      { id: 'B', label: 'Add two Luxardo cherries for extra sweetness' },
      { id: 'C', label: 'Float grated nutmeg for aromatic flourish' },
      { id: 'D', label: 'Add a dash of Angostura to the bubbles' }
    ],
    correct: 'A',
    difficulty: 'easy',
    details: 'Lemon oils brighten the champagne — cherries would overwhelm the balance.'
  },
  {
    id: 'prep-sequence',
    title: 'Service Setup',
    prompt: 'Shift change hits. What prep task comes first to survive the next rush?',
    options: [
      { id: 'A', label: 'Restock the well with clean tins and strainers' },
      { id: 'B', label: 'Polish glassware already on the shelves' },
      { id: 'C', label: 'Update the menu chalkboard' },
      { id: 'D', label: 'Prep garnish peels after the first ticket arrives' }
    ],
    correct: 'A',
    difficulty: 'easy',
    details: 'Having tins, strainers, and shakers ready keeps service smooth before tickets spike.'
  },
  {
    id: 'kitten-mode-shake',
    title: 'Kitten Mode Flair',
    prompt: 'Kitten-mode VIP wants drama with their Clover Club. What flourish still keeps the drink balanced?',
    options: [
      { id: 'A', label: 'Dry shake extra long, then add glitter bitters on the foam' },
      { id: 'B', label: 'Top with whipped cream for color contrast' },
      { id: 'C', label: 'Replace lemon with lime to intensify snap' },
      { id: 'D', label: 'Swap raspberry syrup for grenadine' }
    ],
    correct: 'A',
    difficulty: 'medium',
    details: 'Extended dry shake gives plush foam; edible glitter bitters keep balance intact.'
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

export function generateBartenderStages(count = 5) {
  const pool = shuffle(STAGES);
  return pool.slice(0, count);
}

export default generateBartenderStages;
