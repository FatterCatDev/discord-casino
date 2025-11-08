import { getTopUsers } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';

const HOME_GUILD_ID = (process.env.PRIMARY_GUILD_ID || process.env.GUILD_ID || '').trim() || null;

const YES_RESPONSES = [
  'Absolutely.',
  'Without a doubt.',
  'All signs point to yes.',
  'Count on it.',
  'Guaranteed.'
];

const NO_RESPONSES = [
  'No chance.',
  'Absolutely not.',
  'Don’t bet on it.',
  'Very doubtful.',
  'The odds say no.'
];

const MAYBE_RESPONSES = [
  'Ask again later.',
  'Too hazy to tell.',
  'Could go either way.',
  'Hard to say—tilt the odds yourself.',
  'Maybe, if luck stays on your side.'
];

function pickAnswer() {
  const buckets = [
    { label: 'yes', pool: YES_RESPONSES },
    { label: 'no', pool: NO_RESPONSES },
    { label: 'maybe', pool: MAYBE_RESPONSES }
  ];
  const group = buckets[Math.floor(Math.random() * buckets.length)];
  const pool = group.pool;
  const text = pool[Math.floor(Math.random() * pool.length)];
  return { label: group.label, text };
}

function resolveLeaderboardGuildId(interaction) {
  return HOME_GUILD_ID || interaction.guild?.id || null;
}

export default async function handleEightBall(interaction, ctx) {
  const questionRaw = interaction.options.getString('question', true);
  const question = questionRaw?.trim() || '';
  if (!question || !question.endsWith('?')) {
    return interaction.reply({
      content: '❌ The 8-ball only listens to real questions. Make sure your question ends with a `?`.',
      ephemeral: false
    });
  }

  const leaderboardGuildId = resolveLeaderboardGuildId(interaction);
  if (!leaderboardGuildId) {
    return interaction.reply({
      content: '❌ I can’t find the leaderboard to crown a champion. Set `PRIMARY_GUILD_ID` first.',
      ephemeral: false
    });
  }

  let championId = null;
  try {
    const [topUser] = await getTopUsers(leaderboardGuildId, 1);
    if (topUser?.discord_id) championId = String(topUser.discord_id);
  } catch (err) {
    console.error('eightball: failed to load leaderboard', err);
    return interaction.reply({
      content: '❌ The 8-ball slipped from my paws—try again once the leaderboard is reachable.',
      ephemeral: false
    });
  }

  if (!championId) {
    return interaction.reply({
      content: '❌ No champion is seated at the top of the leaderboard right now. Claim #1 and try again.',
      ephemeral: false
    });
  }

  if (interaction.user.id !== championId) {
    return interaction.reply({
      content: `${emoji('lock')} Only the reigning #1 High Roller can shake the 8-ball. Take the top spot, then try again.`,
      ephemeral: false
    });
  }

  const answer = pickAnswer();
  const response = [
    `🎱 #1 High Roller, you asked: **${question}**`,
    `Answer: ${answer.text}`
  ].join('\n');

  return interaction.reply({ content: response });
}
