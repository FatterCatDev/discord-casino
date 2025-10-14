import crypto from 'node:crypto';

const BLANK_VALUE = '__blank__';

const DRINK_LIBRARY = {
  type1: [
    {
      id: 'citrus-snap',
      name: 'Citrus Snap',
      ingredients: ['Gin', 'Lime Juice'],
      technique: 'shake'
    },
    {
      id: 'velvet-hammer',
      name: 'Velvet Hammer',
      ingredients: ['Vodka', 'Espresso'],
      technique: 'shake'
    },
    {
      id: 'midnight-highball',
      name: 'Midnight Highball',
      ingredients: ['Whiskey', 'Ginger Beer'],
      technique: 'stir'
    },
    {
      id: 'honey-spark',
      name: 'Honey Spark',
      ingredients: ['Tequila', 'Honey Syrup'],
      technique: 'shake'
    },
    {
      id: 'amber-negroni',
      name: 'Amber Spritz',
      ingredients: ['Aperol', 'Prosecco'],
      technique: 'stir'
    }
  ],
  type2: [
    {
      id: 'garden-collins',
      name: 'Garden Collins',
      ingredients: ['Gin', 'Cucumber Juice', 'Simple Syrup'],
      technique: 'shake'
    },
    {
      id: 'smoked-boulevardier',
      name: 'Smoked Boulevardier',
      ingredients: ['Rye Whiskey', 'Campari', 'Sweet Vermouth'],
      technique: 'stir'
    },
    {
      id: 'island-storm',
      name: 'Island Storm',
      ingredients: ['Dark Rum', 'Pineapple Juice', 'Spiced Syrup'],
      technique: 'shake'
    },
    {
      id: 'blackberry-bramble',
      name: 'Blackberry Bramble',
      ingredients: ['Gin', 'Blackberry Puree', 'Lemon Juice'],
      technique: 'shake'
    }
  ],
  type3: [
    {
      id: 'midnight-mojito',
      name: 'Midnight Mojito',
      ingredients: ['Rum', 'Mint Syrup', 'Lime Juice', 'Soda Water'],
      technique: 'shake'
    },
    {
      id: 'barrel-manhattan',
      name: 'Barrel Manhattan',
      ingredients: ['Rye Whiskey', 'Sweet Vermouth', 'Orange Bitters', 'Oak Tincture'],
      technique: 'stir'
    },
    {
      id: 'starlight-sling',
      name: 'Starlight Sling',
      ingredients: ['Vodka', 'Dragon Fruit Puree', 'Lemon Juice', 'Sparkling Wine'],
      technique: 'shake'
    }
  ]
};

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickUnique(drinks, count) {
  if (drinks.length < count) {
    throw new Error('Insufficient drinks defined for bartender menu.');
  }
  return shuffle(drinks).slice(0, count);
}

function buildMenu() {
  const menu = [
    ...pickUnique(DRINK_LIBRARY.type1, 3).map(drink => ({ ...drink, type: 1 })),
    ...pickUnique(DRINK_LIBRARY.type2, 2).map(drink => ({ ...drink, type: 2 })),
    ...pickUnique(DRINK_LIBRARY.type3, 1).map(drink => ({ ...drink, type: 3 }))
  ];
  return shuffle(menu);
}

export function generateBartenderShift(stageCount = 5) {
  const menu = buildMenu();
  const stages = [];
  for (let i = 0; i < stageCount; i += 1) {
    const drink = menu[crypto.randomInt(0, menu.length)];
    stages.push({
      id: `bartender-stage-${i + 1}`,
      type: 'bartender',
      title: `Guest Order #${i + 1}: ${drink.name}`,
      prompt: `A new ticket drops! Build the **${drink.name}** in order, then finish it the way the guest requested.`,
      drinkId: drink.id,
      drink,
      timerSeconds: drink.ingredients.length + 23,
      correct: `${drink.ingredients.join(' → ')} · ${drink.technique.toUpperCase()}`,
      details: `Recipe: ${drink.ingredients.join(' → ')} · Finish: ${drink.technique.toUpperCase()}`,
      blankValue: BLANK_VALUE
    });
  }

  const ingredientSet = new Set();
  for (const item of menu) {
    for (const ingredient of item.ingredients) {
      ingredientSet.add(ingredient);
    }
  }

  return {
    menu,
    stages,
    blankValue: BLANK_VALUE,
    ingredients: Array.from(ingredientSet)
  };
}

export default generateBartenderShift;
