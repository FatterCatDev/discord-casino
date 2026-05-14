import { getGlobalPlayerCount } from '../db/db.auto.mjs';

const DISCORDFORGE_ENABLED = String(process.env.DISCORDFORGE_ENABLED ?? 'true').toLowerCase() !== 'false';
const DISCORDFORGE_API_KEY = (process.env.DISCORDFORGE_API_KEY || '').trim();
const DISCORDFORGE_API_BASE_URL = (process.env.DISCORDFORGE_API_BASE_URL || 'https://discordforge.org').trim().replace(/\/+$/, '');
const MIN_POST_INTERVAL_SECONDS = 300;
const DEFAULT_POST_INTERVAL_SECONDS = 300;
const REQUEST_TIMEOUT_MS = Math.max(1_000, Number(process.env.DISCORDFORGE_REQUEST_TIMEOUT_MS || 10_000));
const RETRY_MAX = Math.max(0, Number(process.env.DISCORDFORGE_RETRY_MAX || 2));

async function fetchTotalGuilds(client) {
  if (!client) return 0;
  if (!client.shard?.count || client.shard.count <= 1 || typeof client.shard.fetchClientValues !== 'function') {
    return client.guilds?.cache?.size ?? 0;
  }
  try {
    const sizes = await client.shard.fetchClientValues('guilds.cache.size');
    return Array.isArray(sizes) ? sizes.reduce((sum, count) => sum + Number(count || 0), 0) : client.guilds.cache.size;
  } catch (err) {
    console.warn('[discordforge] Failed to aggregate shard guild counts, falling back to local cache size', err);
    return client.guilds?.cache?.size ?? 0;
  }
}

async function buildStatsPayload(client) {
  if (!client) return null;
  const serverCount = await fetchTotalGuilds(client);
  if (!Number.isFinite(serverCount) || serverCount < 0) return null;
  let userCount = 0;
  try {
    userCount = Number(await getGlobalPlayerCount());
  } catch (err) {
    console.warn('[discordforge] Failed to fetch global player count; posting 0 user_count', err);
    userCount = 0;
  }
  if (!Number.isFinite(userCount) || userCount < 0) userCount = 0;
  return {
    server_count: serverCount,
    user_count: userCount
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRetryDelayMs(attempt, retryAfterHeader = null) {
  const retryAfterSeconds = Number(retryAfterHeader);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.ceil(retryAfterSeconds * 1000);
  }
  const base = Math.min(10_000, 1_000 * (2 ** attempt));
  return base + Math.floor(Math.random() * 250);
}

async function postStatsOnce(payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  if (typeof timeout.unref === 'function') timeout.unref();
  try {
    const response = await fetch(`${DISCORDFORGE_API_BASE_URL}/api/bots/stats`, {
      method: 'POST',
      headers: {
        Authorization: DISCORDFORGE_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await response.text().catch(() => '');
    if (response.ok) {
      return { ok: true, status: response.status, body: text };
    }
    const err = new Error(`DISCORDFORGE_HTTP_${response.status}`);
    err.status = response.status;
    err.retryAfter = response.headers.get('retry-after');
    err.body = text;
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export function isDiscordForgePostingEnabled() {
  return DISCORDFORGE_ENABLED && DISCORDFORGE_API_KEY.length > 0;
}

export function startDiscordForgeStatsPoster(client, { intervalSeconds = Number(process.env.DISCORDFORGE_STATS_INTERVAL_SECONDS || DEFAULT_POST_INTERVAL_SECONDS) } = {}) {
  if (!client) {
    throw new Error('startDiscordForgeStatsPoster requires a Discord client instance.');
  }
  if (!DISCORDFORGE_ENABLED) {
    console.log('[discordforge] Stats posting disabled (DISCORDFORGE_ENABLED=false).');
    return null;
  }
  if (!DISCORDFORGE_API_KEY) {
    console.log('[discordforge] Stats posting disabled (missing DISCORDFORGE_API_KEY).');
    return null;
  }

  const intervalMs = Math.max(MIN_POST_INTERVAL_SECONDS, Number(intervalSeconds) || DEFAULT_POST_INTERVAL_SECONDS) * 1000;
  let stopped = false;
  let posting = false;
  let lastPostedKey = null;

  const postStats = async (reason = 'interval') => {
    if (stopped || posting) return;
    posting = true;
    try {
      const payload = await buildStatsPayload(client);
      if (!payload) return;
      const payloadKey = JSON.stringify(payload);
      if (lastPostedKey === payloadKey) {
        console.log(`[discordforge] Skipping stats post (${reason}); payload unchanged.`);
        return;
      }

      let lastError = null;
      for (let attempt = 0; attempt <= RETRY_MAX; attempt += 1) {
        try {
          await postStatsOnce(payload);
          lastPostedKey = payloadKey;
          console.log(`[discordforge] Posted stats (${reason}):`, payload);
          return;
        } catch (err) {
          lastError = err;
          const status = Number(err?.status || 0);
          const isRetryable = err?.name === 'AbortError' || status === 429 || status >= 500 || !status;
          if (!isRetryable || attempt >= RETRY_MAX) {
            break;
          }
          const delayMs = getRetryDelayMs(attempt, err?.retryAfter);
          console.warn(`[discordforge] Stats post failed (${reason}), retrying in ${delayMs}ms`, err?.message || err);
          await sleep(delayMs);
        }
      }

      if (lastError) {
        console.error('[discordforge] Failed to post stats', lastError);
      }
    } catch (err) {
      console.error('[discordforge] Failed to build or post stats', err);
    } finally {
      posting = false;
    }
  };

  const timer = setInterval(() => {
    postStats().catch(() => {});
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  postStats('startup').catch(() => {});

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
    },
    async trigger(reason = 'manual') {
      await postStats(reason);
    }
  };
}