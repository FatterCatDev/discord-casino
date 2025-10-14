import crypto from 'node:crypto';

const GUEST_NAMES = [
  'Alex', 'Jordan', 'Maya', 'Quinn', 'Reese', 'Taylor', 'Sasha', 'Morgan', 'Dev', 'Lena',
  'Riley', 'Harper', 'Nico', 'Avery', 'Skye', 'Elliot', 'Rowan', 'Parker', 'Blair',
  'Zoe', 'Cameron', 'Hayden', 'Sydney', 'Jules', 'Dakota', 'Phoenix', 'Marley', 'Kendall', 'Casey',
  'Addison', 'Bailey', 'Brinley', 'Carson', 'Dorian', 'Emerson', 'Finley', 'Gray', 'Harlow', 'Indigo',
  'Jaime', 'Kai', 'Logan', 'Micah', 'Noel', 'Oakley', 'Payton', 'River', 'Sage', 'Tatum',
  'Uma', 'Vale', 'Winter', 'Xen', 'Yael', 'Zion', 'Callum', 'Drew', 'Ember', 'Flynn',
  'Gia', 'Hudson', 'Isla', 'Juno', 'Keaton', 'Luca', 'Maddox', 'Nova', 'Orion', 'Piper',
  'Rhett', 'Sloane', 'Teagan', 'Ursa', 'Vera', 'West', 'Xanthe', 'Yara', 'Zara', 'Bryn',
  'Cleo', 'Dax', 'Elio', 'Fia', 'Gage', 'Haven', 'Iris', 'Jax', 'Koda', 'Lyra',
  'Mira', 'Nash', 'Opal', 'Pierce', 'Quest', 'Riven', 'Sable', 'Thorne', 'Vida', 'Wren'
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

function ageFromDob(dob) {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

function randomDob(minAge = 19, maxAge = 45) {
  const today = new Date();
  const latest = new Date(today);
  latest.setFullYear(today.getFullYear() - minAge);
  const earliest = new Date(today);
  earliest.setFullYear(today.getFullYear() - maxAge);
  const diff = Math.max(1, latest.getTime() - earliest.getTime());
  const dob = new Date(earliest.getTime() + crypto.randomInt(0, diff));
  return { dob, age: ageFromDob(dob) };
}

function dobForAge(age) {
  return randomDob(age, age + 1);
}

function generateChecklist() {
  return {
    ageRequirement: 21,
    dress: sample(DRESS_CODES),
    wristband: sample(WRISTBANDS),
    guestList: sampleUniqueNames(10)
  };
}

function sampleUniqueNames(count) {
  const set = new Set();
  while (set.size < count) {
    set.add(sample(GUEST_NAMES));
  }
  return Array.from(set);
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
  const { dob, age } = randomDob();
  const dress = resolveDress(checklist.dress);
  const wristband = resolveWristband(checklist.wristband);
  const onGuestList = checklist.guestList.includes(name);
  const meets = onGuestList && age > checklist.ageRequirement && dress.id === checklist.dress.id && wristband.id === checklist.wristband.id;
  return { name, age, dob, dress, wristband, meets, onGuestList };
}

function ensureAtLeastOnePasses(guests, checklist) {
  if (guests.some(guest => guest.meets)) return guests;
  const chosen = guests[crypto.randomInt(0, guests.length)];
  const targetAge = checklist.ageRequirement + crypto.randomInt(1, 11);
  const { dob, age } = dobForAge(targetAge);
  chosen.dob = dob;
  chosen.age = age;
  chosen.dress = checklist.dress;
  chosen.wristband = checklist.wristband;
  chosen.onGuestList = true;
  chosen.meets = true;
  return guests;
}

function formatDob(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

function describeGuest(guest, index) {
  return [
    `Guest ${index + 1}: ${guest.name}`,
    `• DOB: ${formatDob(guest.dob)}`,
    `• Dress: ${guest.dress.label}`,
    `• Wristband: ${guest.wristband.emoji} ${guest.wristband.label}`,
    `• On Guest List: ${guest.onGuestList ? 'Yes' : 'No'}`
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
    const size = i < 3 ? crypto.randomInt(1, 3) : crypto.randomInt(2, 4);
    if (size <= 1) {
      const guestName = sampleName(usedNames);
      const guest = buildGuest(guestName, checklist);
      stages.push(buildSingleStage(i, checklist, guest));
    } else {
      const guests = Array.from({ length: size }, () => buildGuest(sampleName(usedNames), checklist));
      stages.push(buildPartyStage(i, checklist, guests));
    }
  }

  return stages;
}

export default generateBouncerStages;
