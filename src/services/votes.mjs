import { recordVoteReward, getPendingVoteRewards, redeemVoteRewards, listUsersWithPendingVoteRewards } from '../db/db.auto.mjs';

const TOPGG_BASE_REWARD = toPositiveInt(process.env.VOTE_REWARD_TOPGG, 150);
const TOPGG_WEEKEND_MULTIPLIER = toPositiveNumber(process.env.VOTE_REWARD_TOPGG_WEEKEND_MULTIPLIER, 2);
const TOPGG_ALLOW_TEST = String(process.env.TOPGG_ALLOW_TEST_VOTES || '').toLowerCase() === 'true';
const FALLBACK_BOT_ID = (process.env.TOPGG_BOT_ID || process.env.CLIENT_ID || '').trim();
const TOPGG_VOTE_URL = (process.env.TOPGG_VOTE_URL || (FALLBACK_BOT_ID ? `https://top.gg/bot/${FALLBACK_BOT_ID}/vote` : '')).trim();
const DBL_BOT_ID = (process.env.DBL_BOT_ID || process.env.CLIENT_ID || '').trim();
const DBL_VOTE_URL = (process.env.DBL_VOTE_URL || (DBL_BOT_ID ? `https://discordbotlist.com/bots/${DBL_BOT_ID}/upvote` : '')).trim();
const DBL_API_TOKEN = (process.env.DBL_API_TOKEN || '').trim();
const DBL_VOTE_REWARD = toPositiveInt(process.env.DBL_VOTE_REWARD, TOPGG_BASE_REWARD);
const DBL_POLL_ENABLED = String(process.env.DBL_POLL_ENABLED ?? 'true').toLowerCase() !== 'false';
const DBL_POLL_INTERVAL = Math.max(60_000, Number(process.env.DBL_POLL_INTERVAL_MS || 300_000));
const DBL_VOTE_REASON = process.env.DBL_VOTE_REWARD_REASON || 'discordbotlist vote reward';
const AUTO_REDEEM_GUILD_ID = (process.env.VOTE_REWARD_AUTO_GUILD_ID || process.env.PRIMARY_GUILD_ID || process.env.GUILD_ID || '').trim() || null;
const AUTO_REDEEM_LIMIT = toPositiveInt(process.env.VOTE_REWARD_AUTO_BATCH_LIMIT, 25);
const AUTO_REDEEM_ENABLED = String(process.env.VOTE_AUTO_REDEEM ?? 'true').toLowerCase() !== 'false';
const AUTO_REDEEM_REASON = process.env.VOTE_REWARD_REASON || 'vote reward';

const EXTRA_SITES = parseExtraSites(process.env.VOTE_EXTRA_LINKS);

const BUILT_SITES = buildVoteSites();
const SITE_LOOKUP = new Map(BUILT_SITES.map(site => [site.id, site]));

function toPositiveInt(value, fallback) {
  const num = Number(value);
  if (Number.isInteger(num) && num > 0) return num;
  return fallback;
}

function toPositiveNumber(value, fallback) {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) return num;
  return fallback;
}

function boolFrom(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase();
    return lower === 'true' || lower === '1' || lower === 'yes';
  }
  return false;
}

function parseExtraSites(raw) {
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) parsed = null;
  } catch {
    parsed = null;
  }

  if (!parsed) {
    parsed = String(raw)
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => {
        const [label, url] = part.split('|').map(seg => seg.trim());
        if (!label || !url) return null;
        return { id: slugify(label), label, url, emoji: '🔗', supportsReward: false };
      })
      .filter(Boolean);
  }

  return parsed
    .map(entry => normalizeSite(entry))
    .filter(Boolean);
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'site';
}

function normalizeSite(entry) {
  if (!entry) return null;
  const label = String(entry.label || entry.name || '').trim();
  const url = String(entry.url || '').trim();
  if (!label || !url) return null;
  const id = String(entry.id || slugify(label));
  const emoji = entry.emoji || '🔗';
  const supportsReward = Boolean(entry.supportsReward);
  const baseReward = supportsReward ? toPositiveInt(entry.baseReward, 0) : 0;
  const weekendMultiplier = supportsReward ? toPositiveNumber(entry.weekendMultiplier, 1) : 1;
  return { id, label, url, emoji, supportsReward, baseReward, weekendMultiplier };
}

function buildVoteSites() {
  const sites = [];
  if (TOPGG_VOTE_URL) {
    sites.push({
      id: 'topgg',
      label: 'Top.gg',
      emoji: '🗳️',
      url: TOPGG_VOTE_URL,
      supportsReward: true,
      baseReward: TOPGG_BASE_REWARD,
      weekendMultiplier: TOPGG_WEEKEND_MULTIPLIER
    });
  }
  if (DBL_VOTE_URL) {
    sites.push({
      id: 'dbl',
      label: 'DiscordBotList.com',
      emoji: '🔔',
      url: DBL_VOTE_URL,
      supportsReward: false,
      baseReward: 0,
      weekendMultiplier: 1
    });
  }
  for (const site of EXTRA_SITES) {
    sites.push(site);
  }
  return sites;
}

function computeTopggReward(isWeekend) {
  const mult = isWeekend ? TOPGG_WEEKEND_MULTIPLIER : 1;
  const reward = Math.round(TOPGG_BASE_REWARD * mult);
  return Math.max(1, reward);
}

function summarizeBySource(rewards = []) {
  const map = new Map();
  for (const reward of rewards) {
    const key = reward?.source || 'unknown';
    const entry = map.get(key) || { source: key, count: 0, total: 0 };
    entry.count += 1;
    entry.total += Number(reward?.reward_amount || 0);
    map.set(key, entry);
  }
  return Array.from(map.values());
}

export function getVoteSites() {
  return BUILT_SITES;
}

export function getVoteSite(id) {
  return SITE_LOOKUP.get(String(id || '')) || null;
}

export function formatSourceLabel(sourceId) {
  const site = getVoteSite(sourceId);
  return site ? site.label : sourceId;
}

export async function getVoteSummary(discordId) {
  const rewards = await getPendingVoteRewards(discordId);
  const totalPendingAmount = rewards.reduce((sum, reward) => sum + Number(reward?.reward_amount || 0), 0);
  return {
    rewards,
    totalPendingAmount,
    breakdown: summarizeBySource(rewards)
  };
}

export async function claimVoteRewards(guildId, discordId) {
  const result = await redeemVoteRewards(guildId, discordId, { reason: 'vote reward' });
  return {
    ...result,
    breakdown: summarizeBySource(result?.claimedRewards || [])
  };
}

export async function autoRedeemPendingVoteRewards(options = {}) {
  if (!AUTO_REDEEM_ENABLED) return [];
  const {
    guildId = AUTO_REDEEM_GUILD_ID,
    limit = AUTO_REDEEM_LIMIT,
    reason = AUTO_REDEEM_REASON,
    adminId = 'vote:auto'
  } = options;
  const userIds = await listUsersWithPendingVoteRewards(limit);
  const results = [];
  for (const userId of userIds) {
    try {
      const res = await redeemVoteRewards(guildId, userId, { reason, adminId });
      if (res?.claimedCount > 0 && res?.claimedTotal > 0) {
        results.push({
          userId,
          ...res,
          breakdown: summarizeBySource(res.claimedRewards || [])
        });
      }
    } catch (err) {
      // Continue processing other users; caller can log.
      results.push({ userId, error: err });
    }
  }
  return results;
}

function normalizeDblVotes(payload) {
  if (!payload) return [];
  const raw = Array.isArray(payload?.votes)
    ? payload.votes
    : Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload)
        ? payload
        : [];
  return raw.filter(Boolean).map(item => {
    const userObj = item.user || item.member || {};
    const voteId = item.id || item.vote_id || item.voteId || item._id || null;
    const userId = String(item.user_id || item.userId || userObj.id || userObj.user_id || item.user || '').trim();
    const tsRaw = item.created_at || item.createdAt || item.timestamp || item.date || item.time || null;
    let ts = Math.floor(Date.now() / 1000);
    if (tsRaw) {
      const d = new Date(tsRaw);
      if (!Number.isNaN(d.valueOf())) ts = Math.floor(d.valueOf() / 1000);
    }
    return { userId, voteId: voteId ? String(voteId) : null, earnedAt: ts, raw: item };
  }).filter(vote => vote.userId);
}

export function isDiscordBotListPollingEnabled() {
  return DBL_POLL_ENABLED && !!DBL_API_TOKEN && !!(DBL_BOT_ID || FALLBACK_BOT_ID);
}

export function getDiscordBotListPollIntervalMs() {
  return DBL_POLL_INTERVAL;
}

export async function ingestDiscordBotListVotes() {
  if (!isDiscordBotListPollingEnabled()) return [];
  const botId = DBL_BOT_ID || FALLBACK_BOT_ID;
  if (!botId) return [];

  const url = `https://discordbotlist.com/api/v1/bots/${botId}/votes`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bot ${DBL_API_TOKEN}`,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`DBL_FETCH_FAILED_${res.status}: ${text}`);
  }
  let data;
  try {
    data = await res.json();
  } catch (err) {
    throw new Error('DBL_INVALID_JSON');
  }
  const votes = normalizeDblVotes(data);
  const recorded = [];
  for (const vote of votes) {
    const metadata = { dbl: vote.raw };
    const inserted = await recordVoteReward(vote.userId, 'dbl', DBL_VOTE_REWARD, metadata, vote.earnedAt, vote.voteId);
    if (inserted) {
      recorded.push({ userId: vote.userId, voteId: vote.voteId, earnedAt: vote.earnedAt });
    }
  }
  return recorded;
}

export async function recordTopggVote(payload = {}) {
  const userId = String(payload.user || '').trim();
  if (!userId) throw new Error('TOPGG_USER_REQUIRED');
  const type = String(payload.type || 'upvote').toLowerCase();
  const isTest = type === 'test';
  if (isTest && !TOPGG_ALLOW_TEST) {
    return { recorded: false, amount: 0, isWeekend: boolFrom(payload.isWeekend), test: true };
  }
  const isWeekend = boolFrom(payload.isWeekend);
  const amount = computeTopggReward(isWeekend);
  const metadata = {
    isWeekend,
    type,
    bot: payload.bot || null,
    query: payload.query || null,
    guild: payload.guild || null,
    test: isTest
  };
  const earnedAt = Number.isInteger(payload.earned_at)
    ? Number(payload.earned_at)
    : Math.floor(Date.now() / 1000);
  await recordVoteReward(userId, 'topgg', amount, metadata, earnedAt);
  return { recorded: true, amount, isWeekend, test: isTest };
}

export function describeBreakdown(breakdown = []) {
  if (!breakdown.length) return '';
  return breakdown
    .map(entry => {
      const siteLabel = formatSourceLabel(entry.source);
      return entry.count > 1 ? `${siteLabel} ×${entry.count}` : siteLabel;
    })
    .join(', ');
}
