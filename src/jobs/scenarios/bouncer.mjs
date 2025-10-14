import crypto from 'node:crypto';

const GUEST_NAMES = [
  'Alex', 'Jordan', 'Maya', 'Quinn', 'Reese', 'Taylor', 'Sasha', 'Morgan', 'Dev', 'Lena',
  'Riley', 'Harper', 'Nico', 'Avery', 'Skye', 'Elliot', 'Rowan', 'Parker', 'Blair', 'Zoe'
];

const DRESS_CODES = [
  { id: 'fancy', label: 'Fancy' },
  { id: 'cocktail', label: 'Cocktail' },
  { id: 'urban-glam', label: 'Urban Glam' },
  { id: 'black-tie', label: 'Black Tie' },
  { id: 'modern-chic', label: 'Modern Chic' }
];

const WRISTBANDS = [
  { id: 'crimson', label: 'Crimson', emoji: '🔴' },
  { id: 'azure', label: 'Azure', emoji: '🔵' },
  { id: 'gold', label: 'Gold', emoji: '🟡' },
  { id: 'jade', label: 'Jade', emoji: '🟢' },
  { id: 'violet', label: 'Violet', emoji: '🟣' }
];

function sample(array) {
  return array[crypto.randomInt(0, array.length)];
}

function sampleName(used) {
  let name;
  let attempts = 0;
  do {
    name = sample(GUEST_NAMES);
    attempts += 1;
  } while (used.has(name) && attempts < 10);
  used.add(name);
  return name;
}

function randomAge() {
  return crypto.randomInt(19, 45);
}

function generateChecklist() {
  return {
    ageRequirement: 21,
    dress: sample(DRESS_CODES),
    wristband: sample(WRISTBANDS)
  };
}

function resolveDress(required) {
  if (Math.random() < 0.6) return required;
  let pick = sample(DRESS_CODES);
  if (pick.id === required.id) {
    pick = sample(DRESS_CODES.filter(code => code.id !== required.id));
  }
  return pick;
}

function resolveWristband(required) {
  if (Math.random() < 0.6) return required;
  let pick = sample(WRISTBANDS);
  if (pick.id === required.id) {
    pick = sample(WRISTBANDS.filter(band => band.id !== required.id));
  }
  return pick;
}

function buildGuest(name, checklist) {
  const age = randomAge();
  const dress = resolveDress(checklist.dress);
  const wristband = resolveWristband(checklist.wristband);
  const meets = age > checklist.ageRequirement && dress.id === checklist.dress.id && wristband.id === checklist.wristband.id;
  return { name, age, dress, wristband, meets };
}

function ensureAtLeastOnePasses(guests, checklist) {
  if (guests.some(guest => guest.meets)) return guests;
  const chosen = guests[crypto.randomInt(0, guests.length)];
  chosen.age = checklist.ageRequirement + crypto.randomInt(1, 10);
  chosen.dress = checklist.dress;
  chosen.wristband = checklist.wristband;
  chosen.meets = true;
  return guests;
}

function describeGuest(guest, index) {
  return [
    `Guest ${index + 1}: ${guest.name}`,
    `• Age: ${guest.age}`,
    `• Dress: ${guest.dress.label}`,
    `• Wristband: ${guest.wristband.emoji} ${guest.wristband.label}`
  ].join('\n');
}

function describeChecklist(checklist) {
  return [
    'Checklist:',
    `• Age: over ${checklist.ageRequirement}`,
    `• Dress Code: ${checklist.dress.label}`,
    `• Wrist Band Color: ${checklist.wristband.emoji} ${checklist.wristband.label}`
  ].join('\n');
}

function describeFailures(guest, checklist) {
  const reasons = [];
  if (!(guest.age > checklist.ageRequirement)) reasons.push('under-age');
  if (guest.dress.id !== checklist.dress.id) reasons.push(`dress (${guest.dress.label})`);
  if (guest.wristband.id !== checklist.wristband.id) reasons.push(`wristband (${guest.wristband.label})`);
  return reasons.length ? reasons.join(', ') : 'meets all criteria';
}

function buildSingleStage(index, checklist, guest) {
  const admitOptionId = `ADMIT:${guest.name}`;
  const denyOptionId = `DENY:${guest.name}`;
  const prompt = [
    describeChecklist(checklist),
    '',
    'Lineup:',
    describeGuest(guest, 0),
    '',
    'Who gets in?'
  ].join('\n');
  const correct = guest.meets ? admitOptionId : denyOptionId;
  const details = guest.meets
    ? `${guest.name} meets every requirement — age ${guest.age}, ${guest.wristband.emoji} band, ${guest.dress.label} attire.`
    : `${guest.name} fails due to ${describeFailures(guest, checklist)}.`;
  return {
    id: `bouncer-${index + 1}`,
    title: `Checkpoint ${index + 1}`,
    prompt,
    options: [
      { id: admitOptionId, label: `Admit ${guest.name}` },
      { id: denyOptionId, label: `Deny ${guest.name}` }
    ],
    correct,
    difficulty: guest.meets ? 'easy' : 'medium',
    details
  };
}

function combinationLabel(guests, mask) {
  const admitted = [];
  const denied = [];
  guests.forEach((guest, idx) => {
    if (mask & (1 << idx)) admitted.push(guest.name);
    else denied.push(guest.name);
  });
  if (admitted.length === guests.length) return 'Admit everyone';
  if (admitted.length === 0) return 'Deny everyone';
  return `Admit ${admitted.join(', ')}; deny ${denied.join(', ')}`;
}

function combinationId(guests, mask) {
  const admitted = [];
  guests.forEach((guest, idx) => {
    if (mask & (1 << idx)) admitted.push(guest.name);
  });
  return `ADMIT:${admitted.sort().join(',') || 'NONE'}`;
}

function buildPartyStage(index, checklist, guests) {
  ensureAtLeastOnePasses(guests, checklist);
  const prompt = [
    describeChecklist(checklist),
    '',
    'Lineup:',
    guests.map((guest, idx) => describeGuest(guest, idx)).join('\n\n'),
    '',
    'Select the group outcome.'
  ].join('\n');

  const options = [];
  const totalCombos = 1 << guests.length;
  for (let mask = 0; mask < totalCombos; mask += 1) {
    options.push({
      id: combinationId(guests, mask),
      label: combinationLabel(guests, mask)
    });
  }

  const correctMask = guests.reduce((mask, guest, idx) => (
    guest.meets ? mask | (1 << idx) : mask
  ), 0);
  const correct = combinationId(guests, correctMask);

  const admittedNames = guests.filter(g => g.meets).map(g => g.name);
  const deniedNames = guests.filter(g => !g.meets).map(g => `${g.name} (${describeFailures(g, checklist)})`);
  const detailsPieces = [];
  detailsPieces.push(admittedNames.length
    ? `Admit: ${admittedNames.join(', ')}.`
    : 'Admit: no one.');
  detailsPieces.push(deniedNames.length
    ? `Deny: ${deniedNames.join(', ')}.`
    : 'Deny: no issues.');

  return {
    id: `bouncer-${index + 1}`,
    title: `Checkpoint ${index + 1}`,
    prompt,
    options,
    correct,
    difficulty: guests.length === 2 ? 'medium' : 'hard',
    details: detailsPieces.join(' ')
  };
}

export function generateBouncerStages(count = 5) {
  const stages = [];
  const usedNames = new Set();

  for (let i = 0; i < count; i += 1) {
    const checklist = generateChecklist();
    if (i < 3) {
      const guestName = sampleName(usedNames);
      const guest = buildGuest(guestName, checklist);
      stages.push(buildSingleStage(i, checklist, guest));
    } else {
      const size = crypto.randomInt(2, 4);
      const guests = Array.from({ length: size }, () => buildGuest(sampleName(usedNames), checklist));
      stages.push(buildPartyStage(i, checklist, guests));
    }
  }

  return stages;
}

export default generateBouncerStages;
