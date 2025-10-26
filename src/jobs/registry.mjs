const JOB_DEFINITIONS = [
  {
    id: 'bartender',
    displayName: 'Bartender',
    emojiKey: 'cocktail',
    tagline: {
      normal: 'Craft perfect cocktails during the nightclub rush.',
      kitten: 'Shake, stir, and dazzle the VIP lounge, Kitten.'
    },
    fantasy: 'Sequence ingredients, techniques, and garnishes in a single rush-ticket showdown.',
    highlights: [
      'One high-pressure order with memory and speed pressure',
      'Recipe registry with VIP twists and rush-hour modifiers',
      'Performance scored on perfection streaks and completion time'
    ]
  },
  {
    id: 'dealer',
    displayName: 'Card Dealer',
    emojiKey: 'pokerSpade',
    tagline: {
      normal: 'Run a rapid-fire table and call the best poker hand.',
      kitten: 'Flip the board and call those winners with flair, Kitten.'
    },
    fantasy: 'Identify the winning hand (or split) on the high-stakes “Best Hand Call” board.',
    highlights: [
      'One high-stakes poker board per shift',
      'Split-pot logic and optional retry mode for partial credit',
      'Speed bonus rewards quick, confident calls'
    ]
  },
  {
    id: 'bouncer',
    displayName: 'Bouncer',
    emojiKey: 'bouncer',
    tagline: {
      normal: 'Guard the velvet rope and keep the queue under control.',
      kitten: 'Spot those fakes and protect the den, Kitten.'
    },
    fantasy: 'Parse guest profiles, spot fake IDs, and juggle special events in a Queue Control showdown.',
    highlights: [
      'Guest-by-guest decisions across a single lineup (2–5 guests)',
      'Dynamic rulesets, VIP overrides, and escalation options',
      'Speed and accuracy tracking to surface toughest calls'
    ]
  }
];

const JOBS_BY_ID = new Map(JOB_DEFINITIONS.map(job => [job.id, job]));

export function listJobs() {
  return JOB_DEFINITIONS.slice();
}

export function getJobById(id) {
  return JOBS_BY_ID.get(id) ?? null;
}

export const JOB_COUNT = JOB_DEFINITIONS.length;

export default {
  listJobs,
  getJobById,
  JOBS_BY_ID,
  JOB_DEFINITIONS,
  JOB_COUNT
};
