const RANK_TITLES = [
  'Novice',
  'Trainee',
  'Apprentice',
  'Junior Specialist',
  'Specialist',
  'Senior Specialist',
  'Expert',
  'Veteran',
  'Elite',
  'Master'
];

export function rankTitle(rank) {
  const idx = Math.max(1, Math.min(10, Number(rank) || 1)) - 1;
  return RANK_TITLES[idx] || RANK_TITLES[0];
}

export { RANK_TITLES };
