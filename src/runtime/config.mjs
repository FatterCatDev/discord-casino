export const OWNER_USER_IDS = Array.from(new Set([
  '94915805375889408',
  ...(process.env.OWNER_USER_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
]));

export const WELCOME_BONUS_AMOUNT = 200;

export const WELCOME_ACK_CUSTOM_ID = 'welcome|ack';

export const REVIEW_PROMPT_INTERACTION_THRESHOLD = 100;

export const REVIEW_PROMPT_RETRY_SECONDS = 7 * 24 * 60 * 60;

export const REVIEW_PROMPT_MESSAGE = [
  '🎉 You just hit 100 interactions with Semuta Casino Bot!',
  '',
  'Did you have fun with the app? If so, please write a review on Top.gg to help others discover the casino.',
  "If you're enjoying Semuta Casino Bot, please consider leaving a review on Top.gg!",
  'https://top.gg/bot/1415454565687492780#reviews'
].join('\n');

export const REVIEW_PROMPT_SUPPORT_MESSAGE = [
  '🏠 Our support team and main game floor live in the Semuta hub.',
  'Join us anytime: discord.gg/semutaofdune'
].join('\n');

export const NEWS_COOLDOWN_SECONDS = 7 * 24 * 60 * 60;

export const GUILD_SETTINGS_TTL_MS = Math.max(5_000, Number(process.env.GUILD_SETTINGS_CACHE_TTL_MS || 45_000));

export const ACCESS_LIST_TTL_MS = Math.max(5_000, Number(process.env.ACCESS_LIST_CACHE_TTL_MS || 30_000));

export const ACTIVE_NEWS_TTL_MS = Math.max(10_000, Number(process.env.ACTIVE_NEWS_CACHE_TTL_MS || 120_000));

export const INTERACTION_EVENT_RETENTION_DAYS = Math.max(7, Number(process.env.INTERACTION_EVENT_RETENTION_DAYS || 90));

export const INTERACTION_EVENT_PRUNE_BATCH_SIZE = Math.max(100, Number(process.env.INTERACTION_EVENT_PRUNE_BATCH_SIZE || 10_000));

export const INTERACTION_EVENT_PRUNE_INTERVAL_MS = Math.max(60_000, Number(process.env.INTERACTION_EVENT_PRUNE_INTERVAL_MS || 15 * 60_000));

export const ONBOARDING_ACK_CACHE_MAX = Math.max(1_000, Number(process.env.ONBOARDING_ACK_CACHE_MAX || 100_000));

export const GUILD_SETTINGS_CACHE_MAX = Math.max(100, Number(process.env.GUILD_SETTINGS_CACHE_MAX || 5_000));

export const ACCESS_LIST_CACHE_MAX = Math.max(100, Number(process.env.ACCESS_LIST_CACHE_MAX || 5_000));

export const USER_NEWS_STATE_MAX = Math.max(500, Number(process.env.USER_NEWS_STATE_MAX || 100_000));

export const VOTE_REWARD_DM_CONCURRENCY = Math.max(1, Math.min(10, Number(process.env.VOTE_REWARD_DM_CONCURRENCY || 3)));

export const HOLDEM_ORPHAN_SWEEP_START_DELAY_MS = Math.max(1_000, Number(process.env.HOLDEM_ORPHAN_SWEEP_START_DELAY_MS || 20_000));

export const HOLDEM_ORPHAN_SWEEP_GUILD_BATCH_SIZE = Math.max(1, Math.min(10, Number(process.env.HOLDEM_ORPHAN_SWEEP_GUILD_BATCH_SIZE || 2)));

export const HOLDEM_ORPHAN_SWEEP_BATCH_INTERVAL_MS = Math.max(100, Number(process.env.HOLDEM_ORPHAN_SWEEP_BATCH_INTERVAL_MS || 1_500));

export function toMinInt(raw, fallback, min) {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
}

export function toBool(raw, fallback = true) {
  if (raw == null || raw === '') return fallback;
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
}

export const COMEBACK_BONUS_CHIPS = toMinInt(process.env.COMEBACK_BONUS_CHIPS, 10_000, 0);

export const COMEBACK_BONUS_ENABLED = toBool(process.env.COMEBACK_BONUS_ENABLED, true);
