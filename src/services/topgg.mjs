import { Api } from '@top-gg/sdk';

const TOPGG_API_TOKEN = (process.env.TOPGG_API_TOKEN || process.env.TOPGG_TOKEN || '').trim();
const MIN_POST_INTERVAL_SECONDS = 300;
const DEFAULT_POST_INTERVAL_SECONDS = 1800;

function createTopggApi() {
  if (!TOPGG_API_TOKEN) return null;
  try {
    return new Api(TOPGG_API_TOKEN);
  } catch (err) {
    console.error('[top.gg] Failed to instantiate API client', err);
    return null;
  }
}

async function fetchTotalGuilds(client) {
  if (!client) return 0;
  if (!client.shard?.count || client.shard.count <= 1 || typeof client.shard.fetchClientValues !== 'function') {
    return client.guilds?.cache?.size ?? 0;
  }
  try {
    const sizes = await client.shard.fetchClientValues('guilds.cache.size');
    return Array.isArray(sizes) ? sizes.reduce((sum, count) => sum + Number(count || 0), 0) : client.guilds.cache.size;
  } catch (err) {
    console.warn('[top.gg] Failed to aggregate shard guild counts, falling back to local cache size', err);
    return client.guilds?.cache?.size ?? 0;
  }
}

async function buildStatsPayload(client) {
  if (!client) return null;
  const serverCount = await fetchTotalGuilds(client);
  if (!serverCount || serverCount < 0) return null;
  const payload = { serverCount };
  if (client.shard?.count && client.shard.count > 1) {
    payload.shardCount = client.shard.count;
    const shardIds = client.shard.ids;
    if (Array.isArray(shardIds) && shardIds.length > 0) {
      payload.shardId = shardIds[0];
    } else if (typeof shardIds === 'number') {
      payload.shardId = shardIds;
    }
  }
  return payload;
}

export function startTopggStatsPoster(client, { intervalSeconds = Number(process.env.TOPGG_POST_INTERVAL_SECONDS || DEFAULT_POST_INTERVAL_SECONDS) } = {}) {
  if (!client) {
    throw new Error('startTopggStatsPoster requires a Discord client instance.');
  }
  const api = createTopggApi();
  if (!api) {
    console.log('[top.gg] Stats posting disabled (missing TOPGG_API_TOKEN).');
    return null;
  }
  if (client.shard?.count && client.shard.count > 1) {
    const shardIds = client.shard.ids;
    const managesShardZero = Array.isArray(shardIds)
      ? shardIds.includes(0)
      : typeof shardIds === 'number'
        ? shardIds === 0
        : false;
    if (!managesShardZero) {
      console.log('[top.gg] Stats posting only runs on shard 0; skipping for this shard.');
      return null;
    }
  }
  const intervalMs = Math.max(MIN_POST_INTERVAL_SECONDS, Number(intervalSeconds) || DEFAULT_POST_INTERVAL_SECONDS) * 1000;
  let stopped = false;
  let posting = false;

  const postStats = async (reason = 'interval') => {
    if (stopped || posting) return;
    posting = true;
    try {
      const payload = await buildStatsPayload(client);
      if (!payload) return;
      await api.postStats(payload);
      console.log(`[top.gg] Posted stats (${reason}):`, payload);
    } catch (err) {
      console.error('[top.gg] Failed to post stats', err);
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

export function isTopggPostingEnabled() {
  return TOPGG_API_TOKEN.length > 0;
}
