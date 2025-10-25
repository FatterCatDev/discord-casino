import crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import 'dotenv/config';

let Pool;
try { ({ Pool } = await import('pg')); } catch {
  throw new Error('Missing dependency: pg. Run `npm install pg`');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: buildSslConfig()
});

function buildSslConfig() {
  const mode = (process.env.PGSSLMODE || '').toLowerCase();
  if (!mode || mode === 'disable') return undefined;

  const inlineCert = process.env.DATABASE_CA_CERT;
  if (inlineCert) {
    return { ca: inlineCert.replace(/\\n/g, '\n') };
  }

  const certPath = process.env.DATABASE_CA_CERT_PATH || process.env.PGSSLROOTCERT;
  if (certPath && existsSync(certPath)) {
    return { ca: readFileSync(certPath, 'utf8') };
  }

  if (mode === 'verify-full' || mode === 'verify-ca') {
    throw new Error(`PGSSLMODE=${mode} requires a CA certificate. Set DATABASE_CA_CERT, DATABASE_CA_CERT_PATH, or PGSSLROOTCERT.`);
  }

  return { rejectUnauthorized: false };
}

const DEFAULT_GUILD_ID = process.env.PRIMARY_GUILD_ID || process.env.GUILD_ID || 'global';
const ECONOMY_SCOPE = (process.env.ECONOMY_SCOPE || 'global').toLowerCase();
const ECONOMY_GUILD_ID = process.env.GLOBAL_ECONOMY_ID || DEFAULT_GUILD_ID;
const USE_GLOBAL_ECONOMY = ECONOMY_SCOPE !== 'guild';

async function q(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}
async function q1(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await fn(client);
    await client.query('COMMIT');
    return res;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    throw err;
  } finally {
    client.release();
  }
}

async function tableHasColumn(table, column) {
  const row = await q1(
    'SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
    [table, column]
  );
  return !!row;
}

async function tableExists(table) {
  const row = await q1(
    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1",
    [table]
  );
  return !!row;
}

async function migrateUsersToGuildScoped() {
  if (await tableHasColumn('users', 'guild_id')) return;
  await tx(async c => {
    await c.query('ALTER TABLE users RENAME TO users_legacy');
    await c.query(`
      CREATE TABLE users (
        guild_id TEXT NOT NULL,
        discord_id TEXT NOT NULL,
        chips BIGINT NOT NULL DEFAULT 0,
        credits BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        PRIMARY KEY (guild_id, discord_id)
      )
    `);
    await c.query(
      'INSERT INTO users (guild_id, discord_id, chips, credits, created_at, updated_at) SELECT $1, discord_id, chips, credits, created_at, updated_at FROM users_legacy',
      [ECONOMY_GUILD_ID]
    );
    await c.query('DROP TABLE users_legacy');
  });
  await q('CREATE INDEX IF NOT EXISTS idx_users_guild_discord ON users (guild_id, discord_id)');
}

async function migrateTransactionsToGuildScoped() {
  if (await tableHasColumn('transactions', 'guild_id')) return;
  await tx(async c => {
    await c.query('ALTER TABLE transactions RENAME TO transactions_legacy');
    await c.query(`
      CREATE TABLE transactions (
        id SERIAL PRIMARY KEY,
        guild_id TEXT NOT NULL,
        account TEXT NOT NULL,
        delta BIGINT NOT NULL,
        reason TEXT,
        admin_id TEXT,
        currency TEXT NOT NULL DEFAULT 'CHIPS',
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await c.query(
      'INSERT INTO transactions (id, guild_id, account, delta, reason, admin_id, currency, created_at) SELECT id, $1, account, delta, reason, admin_id, currency, created_at FROM transactions_legacy',
      [ECONOMY_GUILD_ID]
    );
    await c.query('DROP TABLE transactions_legacy');
    const seqRes = await c.query(`SELECT pg_get_serial_sequence('transactions','id') AS seq`);
    const seqName = seqRes.rows?.[0]?.seq;
    if (seqName) {
      await c.query(`SELECT setval($1::regclass, COALESCE((SELECT MAX(id) FROM transactions), 1))`, [seqName]);
    }
  });
  await q('CREATE INDEX IF NOT EXISTS idx_transactions_guild_created ON transactions (guild_id, created_at)');
}

async function seedGuildHouseFromLegacy() {
  if (!(await tableExists('guild_house'))) {
    await q(`
      CREATE TABLE guild_house (
        guild_id TEXT PRIMARY KEY,
        chips BIGINT NOT NULL DEFAULT 0,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
  }
  const existing = await q1('SELECT 1 FROM guild_house LIMIT 1');
  if (!existing) {
    let legacy = 0;
    if (await tableExists('house')) {
      const row = await q1('SELECT chips FROM house WHERE id = 1');
      if (row && Number.isFinite(Number(row.chips))) legacy = Number(row.chips);
    }
    await q('INSERT INTO guild_house (guild_id, chips) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ECONOMY_GUILD_ID, legacy]);
  }
  await q('INSERT INTO guild_house (guild_id, chips) VALUES ($1, 0) ON CONFLICT DO NOTHING', [ECONOMY_GUILD_ID]);
}

async function ensureAccessControlTables() {
  await q(`
    CREATE TABLE IF NOT EXISTS mod_users (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    )
  `);
  await q(`
    CREATE TABLE IF NOT EXISTS admin_users (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    )
  `);
  await q(`
    CREATE TABLE IF NOT EXISTS daily_spin_last (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      last_ts BIGINT NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    )
  `);
}

async function ensureJobTables() {
  await q(`
    CREATE TABLE IF NOT EXISTS job_profiles (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      rank INTEGER NOT NULL DEFAULT 1,
      total_xp BIGINT NOT NULL DEFAULT 0,
      xp_to_next BIGINT NOT NULL DEFAULT 100,
      last_shift_at BIGINT,
      created_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()))::BIGINT,
      updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()))::BIGINT,
      PRIMARY KEY (guild_id, user_id, job_id)
    )
  `);
  await q('CREATE INDEX IF NOT EXISTS idx_job_profiles_user ON job_profiles (guild_id, user_id)');
  await q('CREATE INDEX IF NOT EXISTS idx_job_profiles_job ON job_profiles (job_id, guild_id)');

  await q(`
    CREATE TABLE IF NOT EXISTS job_status (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      active_job TEXT NOT NULL DEFAULT 'none',
      job_switch_available_at BIGINT NOT NULL DEFAULT 0,
      cooldown_reason TEXT,
      daily_earning_cap BIGINT,
      earned_today BIGINT NOT NULL DEFAULT 0,
      cap_reset_at BIGINT,
      shift_streak_count BIGINT NOT NULL DEFAULT 0,
      shift_cooldown_expires_at BIGINT NOT NULL DEFAULT 0,
      updated_at BIGINT NOT NULL DEFAULT (EXTRACT(EPOCH FROM NOW()))::BIGINT,
      PRIMARY KEY (guild_id, user_id)
    )
  `);
  await q('CREATE INDEX IF NOT EXISTS idx_job_status_guild_switch ON job_status (guild_id, job_switch_available_at)');
  if (!(await tableHasColumn('job_status', 'shift_streak_count'))) {
    await q('ALTER TABLE job_status ADD COLUMN shift_streak_count BIGINT NOT NULL DEFAULT 0');
  }
  if (!(await tableHasColumn('job_status', 'shift_cooldown_expires_at'))) {
    await q('ALTER TABLE job_status ADD COLUMN shift_cooldown_expires_at BIGINT NOT NULL DEFAULT 0');
  }

  await q(`
    CREATE TABLE IF NOT EXISTS job_shifts (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      started_at BIGINT NOT NULL,
      completed_at BIGINT,
      performance_score INTEGER NOT NULL DEFAULT 0,
      base_pay BIGINT NOT NULL DEFAULT 0,
      tip_percent INTEGER NOT NULL DEFAULT 0,
      tip_amount BIGINT NOT NULL DEFAULT 0,
      total_payout BIGINT NOT NULL DEFAULT 0,
      result_state TEXT NOT NULL DEFAULT 'PENDING',
      metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB
    )
  `);
  await q('CREATE INDEX IF NOT EXISTS idx_job_shifts_user_started ON job_shifts (guild_id, user_id, started_at)');
}

async function ensureOnboardingTable() {
  await q(`
    CREATE TABLE IF NOT EXISTS user_onboarding (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      acknowledged_at BIGINT,
      chips_granted BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id, user_id)
    )
  `);
  await q('CREATE INDEX IF NOT EXISTS idx_user_onboarding_ack ON user_onboarding (guild_id, acknowledged_at)');
}

async function ensureInteractionTables() {
  await q(`
    CREATE TABLE IF NOT EXISTS user_interaction_stats (
      user_id TEXT PRIMARY KEY,
      total_interactions BIGINT NOT NULL DEFAULT 0,
      first_interaction_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_interaction_at TIMESTAMP NOT NULL DEFAULT NOW(),
      last_guild_id TEXT,
      last_channel_id TEXT,
      last_type TEXT,
      last_key TEXT,
      last_locale TEXT,
      last_metadata_json TEXT,
      review_prompt_attempted_at TIMESTAMP,
      review_prompt_sent_at TIMESTAMP,
      review_prompt_status TEXT,
      review_prompt_last_error TEXT
    )
  `);
  await q(`
    CREATE TABLE IF NOT EXISTS user_interaction_events (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      interaction_type TEXT,
      interaction_key TEXT,
      guild_id TEXT,
      channel_id TEXT,
      locale TEXT,
      metadata_json TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await q('CREATE INDEX IF NOT EXISTS idx_user_interaction_events_user ON user_interaction_events (user_id, created_at DESC)');
}

async function mergeEconomyToGlobalScope() {
  if (!USE_GLOBAL_ECONOMY) return;
  const gid = ECONOMY_GUILD_ID;

  const needsUserMerge = await q1('SELECT 1 FROM users WHERE guild_id <> $1 LIMIT 1', [gid]);
  if (needsUserMerge) {
    const aggregates = await q(`
      SELECT discord_id,
             COALESCE(SUM(chips), 0) AS chips,
             COALESCE(SUM(credits), 0) AS credits,
             MIN(created_at) AS created_at,
             MAX(updated_at) AS updated_at
      FROM users
      GROUP BY discord_id
    `);
    await tx(async c => {
      await c.query('DELETE FROM users');
      for (const row of aggregates) {
        const chips = Number(row?.chips || 0);
        const credits = Number(row?.credits || 0);
        const createdAt = row?.created_at || new Date();
        const updatedAt = row?.updated_at || createdAt;
        await c.query(
          'INSERT INTO users (guild_id, discord_id, chips, credits, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)',
          [gid, row.discord_id, chips, credits, createdAt, updatedAt]
        );
      }
    });
  } else {
    await q('UPDATE users SET guild_id = $1 WHERE guild_id <> $1', [gid]);
  }

  await q('UPDATE transactions SET guild_id = $1 WHERE guild_id <> $1', [gid]);

  const needsHouseMerge = await q1('SELECT 1 FROM guild_house WHERE guild_id <> $1 LIMIT 1', [gid]);
  if (needsHouseMerge) {
    const totalRow = await q1('SELECT COALESCE(SUM(chips), 0) AS total FROM guild_house');
    const total = Number(totalRow?.total || 0);
    await tx(async c => {
      await c.query('DELETE FROM guild_house');
      await c.query(
        'INSERT INTO guild_house (guild_id, chips) VALUES ($1,$2) ON CONFLICT (guild_id) DO UPDATE SET chips = EXCLUDED.chips, updated_at = NOW()',
        [gid, total]
      );
    });
  } else {
    await q('INSERT INTO guild_house (guild_id, chips) VALUES ($1, 0) ON CONFLICT (guild_id) DO NOTHING', [gid]);
  }
}

await migrateUsersToGuildScoped();
await migrateTransactionsToGuildScoped();
await seedGuildHouseFromLegacy();
await mergeEconomyToGlobalScope();
await ensureAccessControlTables();
await ensureJobTables();
await ensureOnboardingTable();
await ensureInteractionTables();

try {
  if (await tableExists('guild_settings') && !(await tableHasColumn('guild_settings', 'kitten_mode_enabled'))) {
    await q('ALTER TABLE guild_settings ADD COLUMN kitten_mode_enabled BOOLEAN NOT NULL DEFAULT false');
  }
} catch (err) {
  console.error('Failed to ensure kitten_mode_enabled column on guild_settings:', err);
}

try {
  if (await tableExists('guild_settings') && !(await tableHasColumn('guild_settings', 'update_channel_id'))) {
    await q('ALTER TABLE guild_settings ADD COLUMN update_channel_id TEXT');
  }
} catch (err) {
  console.error('Failed to ensure update_channel_id column on guild_settings:', err);
}

try {
  if (await tableExists('vote_rewards') && !(await tableHasColumn('vote_rewards', 'external_id'))) {
    await q('ALTER TABLE vote_rewards ADD COLUMN external_id TEXT');
  }
} catch (err) {
  console.error('Failed to ensure external_id column on vote_rewards:', err);
}

try {
  if (await tableExists('vote_rewards')) {
    await q('CREATE UNIQUE INDEX IF NOT EXISTS idx_vote_rewards_source_external ON vote_rewards(source, external_id) WHERE external_id IS NOT NULL');
  }
} catch (err) {
  console.error('Failed to ensure unique index on vote_rewards source/external_id:', err);
}

function resolveGuildId(guildId) {
  if (USE_GLOBAL_ECONOMY) return ECONOMY_GUILD_ID;
  return guildId || DEFAULT_GUILD_ID;
}

async function ensureGuildUser(guildId, discordId) {
  await q('INSERT INTO users (guild_id, discord_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [guildId, discordId]);
}

async function ensureGuildHouse(guildId) {
  await q('INSERT INTO guild_house (guild_id) VALUES ($1) ON CONFLICT DO NOTHING', [guildId]);
}

async function houseRow(guildId) {
  await ensureGuildHouse(guildId);
  const row = await q1('SELECT chips FROM guild_house WHERE guild_id = $1', [guildId]);
  return { chips: Number(row?.chips || 0) };
}

function safeParseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapVoteRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    source: row.source,
    reward_amount: Number(row.reward_amount || 0),
    earned_at: Number(row.earned_at || 0),
    metadata: safeParseJson(row.metadata_json)
  };
}

const INSERT_INTERACTION_EVENT_SQL = `
  INSERT INTO user_interaction_events (
    user_id,
    interaction_type,
    interaction_key,
    guild_id,
    channel_id,
    locale,
    metadata_json,
    created_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
`;

const UPSERT_INTERACTION_STAT_SQL = `
  INSERT INTO user_interaction_stats (
    user_id,
    total_interactions,
    first_interaction_at,
    last_interaction_at,
    last_guild_id,
    last_channel_id,
    last_type,
    last_key,
    last_locale,
    last_metadata_json
  ) VALUES ($1, 1, NOW(), NOW(), $2, $3, $4, $5, $6, $7)
  ON CONFLICT (user_id) DO UPDATE SET
    total_interactions = user_interaction_stats.total_interactions + 1,
    last_interaction_at = NOW(),
    last_guild_id = COALESCE(EXCLUDED.last_guild_id, user_interaction_stats.last_guild_id),
    last_channel_id = COALESCE(EXCLUDED.last_channel_id, user_interaction_stats.last_channel_id),
    last_type = EXCLUDED.last_type,
    last_key = EXCLUDED.last_key,
    last_locale = COALESCE(EXCLUDED.last_locale, user_interaction_stats.last_locale),
    last_metadata_json = EXCLUDED.last_metadata_json
  RETURNING
    user_id,
    total_interactions,
    EXTRACT(EPOCH FROM first_interaction_at) AS first_interaction_at,
    EXTRACT(EPOCH FROM last_interaction_at) AS last_interaction_at,
    last_guild_id,
    last_channel_id,
    last_type,
    last_key,
    last_locale,
    last_metadata_json,
    EXTRACT(EPOCH FROM review_prompt_attempted_at) AS review_prompt_attempted_at,
    EXTRACT(EPOCH FROM review_prompt_sent_at) AS review_prompt_sent_at,
    review_prompt_status,
    review_prompt_last_error
`;

const SELECT_INTERACTION_STAT_SQL = `
  SELECT
    user_id,
    total_interactions,
    EXTRACT(EPOCH FROM first_interaction_at) AS first_interaction_at,
    EXTRACT(EPOCH FROM last_interaction_at) AS last_interaction_at,
    last_guild_id,
    last_channel_id,
    last_type,
    last_key,
    last_locale,
    last_metadata_json,
    EXTRACT(EPOCH FROM review_prompt_attempted_at) AS review_prompt_attempted_at,
    EXTRACT(EPOCH FROM review_prompt_sent_at) AS review_prompt_sent_at,
    review_prompt_status,
    review_prompt_last_error
  FROM user_interaction_stats
  WHERE user_id = $1
`;

const MARK_REVIEW_PROMPT_SQL = `
  UPDATE user_interaction_stats
  SET review_prompt_attempted_at = TO_TIMESTAMP($2),
      review_prompt_status = $3,
      review_prompt_sent_at = CASE WHEN $3 = 'sent' THEN TO_TIMESTAMP($2) ELSE review_prompt_sent_at END,
      review_prompt_last_error = $4
  WHERE user_id = $1
  RETURNING
    user_id,
    total_interactions,
    EXTRACT(EPOCH FROM first_interaction_at) AS first_interaction_at,
    EXTRACT(EPOCH FROM last_interaction_at) AS last_interaction_at,
    last_guild_id,
    last_channel_id,
    last_type,
    last_key,
    last_locale,
    last_metadata_json,
    EXTRACT(EPOCH FROM review_prompt_attempted_at) AS review_prompt_attempted_at,
    EXTRACT(EPOCH FROM review_prompt_sent_at) AS review_prompt_sent_at,
    review_prompt_status,
    review_prompt_last_error
`;

function normalizeInteractionStats(row) {
  if (!row) return null;
  return {
    user_id: row.user_id,
    total_interactions: Number(row.total_interactions || 0),
    first_interaction_at: row.first_interaction_at != null ? Number(row.first_interaction_at) : null,
    last_interaction_at: row.last_interaction_at != null ? Number(row.last_interaction_at) : null,
    last_guild_id: row.last_guild_id || null,
    last_channel_id: row.last_channel_id || null,
    last_type: row.last_type || null,
    last_key: row.last_key || null,
    last_locale: row.last_locale || null,
    last_metadata_json: row.last_metadata_json || null,
    review_prompt_attempted_at: row.review_prompt_attempted_at != null ? Number(row.review_prompt_attempted_at) : null,
    review_prompt_sent_at: row.review_prompt_sent_at != null ? Number(row.review_prompt_sent_at) : null,
    review_prompt_status: row.review_prompt_status || null,
    review_prompt_last_error: row.review_prompt_last_error || null
  };
}

export async function recordUserInteraction(details = {}) {
  if (!details || !details.userId) return null;
  const userId = String(details.userId);
  const guildId = details.guildId ? String(details.guildId) : null;
  const channelId = details.channelId ? String(details.channelId) : null;
  const interactionType = details.interactionType || null;
  const interactionKey = details.interactionKey || null;
  const locale = details.locale || null;
  const metadataRaw = details.metadata;
  const metadata = metadataRaw == null ? null : (typeof metadataRaw === 'string' ? metadataRaw : JSON.stringify(metadataRaw));

  const row = await tx(async c => {
    await c.query(INSERT_INTERACTION_EVENT_SQL, [userId, interactionType, interactionKey, guildId, channelId, locale, metadata]);
    const { rows } = await c.query(UPSERT_INTERACTION_STAT_SQL, [userId, guildId, channelId, interactionType, interactionKey, locale, metadata]);
    return rows[0] || null;
  });

  return normalizeInteractionStats(row);
}

export async function getUserInteractionStats(userId) {
  if (!userId) return null;
  const row = await q1(SELECT_INTERACTION_STAT_SQL, [String(userId)]);
  return normalizeInteractionStats(row);
}

export async function markUserInteractionReviewPrompt(userId, { status = 'sent', error = null, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  if (!userId) return null;
  const ts = Number.isFinite(timestamp) ? Math.floor(timestamp) : Math.floor(Date.now() / 1000);
  const row = await q1(MARK_REVIEW_PROMPT_SQL, [String(userId), ts, status || null, error || null]);
  return normalizeInteractionStats(row);
}

async function recordTxn(guildId, account, delta, reason, adminId, currency = 'CHIPS') {
  await q(
    'INSERT INTO transactions (guild_id, account, delta, reason, admin_id, currency) VALUES ($1,$2,$3,$4,$5,$6)',
    [guildId, account, delta, reason || null, adminId || null, currency]
  );
}

// --- Roles ---
function canonicalGuildId(guildId) {
  return guildId ? String(guildId) : DEFAULT_GUILD_ID;
}

export async function getModerators(guildId) {
  const gid = canonicalGuildId(guildId);
  const rows = await q('SELECT user_id FROM mod_users WHERE guild_id = $1', [gid]);
  return rows.map(r => r.user_id);
}
export async function addModerator(guildId, userId) {
  const gid = canonicalGuildId(guildId);
  await q('INSERT INTO mod_users (guild_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [gid, String(userId)]);
  return getModerators(gid);
}
export async function removeModerator(guildId, userId) {
  const gid = canonicalGuildId(guildId);
  await q('DELETE FROM mod_users WHERE guild_id = $1 AND user_id = $2', [gid, String(userId)]);
  return getModerators(gid);
}

export async function getAdmins(guildId) {
  const gid = canonicalGuildId(guildId);
  const rows = await q('SELECT user_id FROM admin_users WHERE guild_id = $1', [gid]);
  return rows.map(r => r.user_id);
}
export async function addAdmin(guildId, userId) {
  const gid = canonicalGuildId(guildId);
  await q('INSERT INTO admin_users (guild_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [gid, String(userId)]);
  return getAdmins(gid);
}
export async function removeAdmin(guildId, userId) {
  const gid = canonicalGuildId(guildId);
  await q('DELETE FROM admin_users WHERE guild_id = $1 AND user_id = $2', [gid, String(userId)]);
  return getAdmins(gid);
}

export async function getLastDailySpinAt(guildId, userId) {
  const gid = canonicalGuildId(guildId);
  const row = await q1('SELECT last_ts FROM daily_spin_last WHERE guild_id = $1 AND user_id = $2', [gid, String(userId)]);
  return row ? Number(row.last_ts || 0) : 0;
}

export async function setLastDailySpinNow(guildId, userId, ts = Math.floor(Date.now() / 1000)) {
  const gid = canonicalGuildId(guildId);
  await q(
    'INSERT INTO daily_spin_last (guild_id, user_id, last_ts) VALUES ($1,$2,$3) ON CONFLICT (guild_id, user_id) DO UPDATE SET last_ts = EXCLUDED.last_ts',
    [gid, String(userId), Number(ts)]
  );
  return ts;
}

// --- Users & House ---
export async function getUserBalances(guildId, discordId) {
  const gid = resolveGuildId(guildId);
  await ensureGuildUser(gid, discordId);
  const row = await q1('SELECT chips, credits FROM users WHERE guild_id = $1 AND discord_id = $2', [gid, discordId]);
  return { chips: Number(row?.chips || 0), credits: Number(row?.credits || 0) };
}

export async function getUserOnboardingStatus(guildId, userId) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const row = await q1('SELECT acknowledged_at, chips_granted FROM user_onboarding WHERE guild_id = $1 AND user_id = $2', [gid, uid]);
  if (!row) return null;
  const acknowledgedAt = row.acknowledged_at !== null && row.acknowledged_at !== undefined
    ? Math.trunc(Number(row.acknowledged_at) || 0)
    : null;
  return {
    acknowledgedAt,
    chipsGranted: Math.trunc(Number(row.chips_granted) || 0)
  };
}

export async function grantUserOnboardingBonus(guildId, userId, amount, reason = 'welcome bonus') {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  const amt = Math.trunc(Number(amount) || 0);
  if (!uid) throw new Error('ONBOARD_USER_REQUIRED');
  if (!Number.isInteger(amt) || amt <= 0) {
    return { granted: false, status: await getUserOnboardingStatus(gid, uid) };
  }
  const result = await tx(async c => {
    await c.query('INSERT INTO users (guild_id, discord_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [gid, uid]);
    await c.query('INSERT INTO user_onboarding (guild_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [gid, uid]);
    const current = await c.query('SELECT chips_granted FROM user_onboarding WHERE guild_id = $1 AND user_id = $2 FOR UPDATE', [gid, uid]);
    const prevGranted = Math.trunc(Number(current?.rows?.[0]?.chips_granted) || 0);
    if (prevGranted >= amt) {
      return { granted: false };
    }
    await c.query('UPDATE users SET chips = chips + $1, updated_at = NOW() WHERE guild_id = $2 AND discord_id = $3', [amt, gid, uid]);
    await c.query(
      'INSERT INTO transactions (guild_id, account, delta, reason, admin_id, currency) VALUES ($1,$2,$3,$4,$5,$6)',
      [gid, uid, amt, reason || 'welcome bonus', null, 'CHIPS']
    );
    await c.query('UPDATE user_onboarding SET chips_granted = $1, updated_at = NOW() WHERE guild_id = $2 AND user_id = $3', [amt, gid, uid]);
    return { granted: true };
  });
  const status = await getUserOnboardingStatus(gid, uid);
  return {
    granted: result?.granted === true,
    status
  };
}

export async function markUserOnboardingAcknowledged(guildId, userId, acknowledgedAt = Math.floor(Date.now() / 1000)) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('ONBOARD_USER_REQUIRED');
  const ack = acknowledgedAt === null ? null : Math.trunc(Number(acknowledgedAt) || Math.floor(Date.now() / 1000));
  await q('INSERT INTO user_onboarding (guild_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [gid, uid]);
  const res = ack === null
    ? { rowCount: 0 }
    : await pool.query('UPDATE user_onboarding SET acknowledged_at = $1, updated_at = NOW() WHERE guild_id = $2 AND user_id = $3 AND acknowledged_at IS NULL', [ack, gid, uid]);
  const status = await getUserOnboardingStatus(gid, uid);
  return {
    acknowledged: (res?.rowCount || 0) > 0 && !!(status && status.acknowledgedAt !== null),
    status
  };
}

export async function getTopUsers(guildId, limit = 10) {
  const gid = resolveGuildId(guildId);
  const n = Math.max(1, Math.min(25, Number(limit) || 10));
  const rows = await q(
    'SELECT discord_id, chips FROM users WHERE guild_id = $1 AND chips > 0 ORDER BY chips DESC, created_at ASC LIMIT $2',
    [gid, n]
  );
  return rows.map(r => ({ discord_id: r.discord_id, chips: Number(r.chips || 0) }));
}

export async function getHouseBalance(guildId) {
  const gid = resolveGuildId(guildId);
  return (await houseRow(gid)).chips;
}

export async function getCasinoNetworth(guildId) {
  const gid = resolveGuildId(guildId);
  const house = await getHouseBalance(gid);
  const row = await q1('SELECT COALESCE(SUM(chips), 0) AS total FROM users WHERE guild_id = $1', [gid]);
  return house + Number(row?.total || 0);
}

export async function getGlobalPlayerCount() {
  const row = await q1('SELECT COUNT(DISTINCT discord_id) AS n FROM users');
  return Number(row?.n || 0);
}

export async function listAllUserIds() {
  const rows = await q('SELECT DISTINCT discord_id FROM users ORDER BY discord_id ASC');
  return rows.map(row => String(row.discord_id));
}

export async function addToHouse(guildId, amount, reason, adminId) {
  const gid = resolveGuildId(guildId);
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0) throw new Error('Amount must be a positive integer.');
  await tx(async c => {
    await c.query('INSERT INTO guild_house (guild_id) VALUES ($1) ON CONFLICT DO NOTHING', [gid]);
    await c.query('UPDATE guild_house SET chips = chips + $1, updated_at = NOW() WHERE guild_id = $2', [amt, gid]);
    await c.query(
      'INSERT INTO transactions (guild_id, account, delta, reason, admin_id, currency) VALUES ($1,$2,$3,$4,$5,$6)',
      [gid, 'HOUSE', amt, reason || 'house top-up', adminId || null, 'CHIPS']
    );
  });
  return getHouseBalance(gid);
}

export async function removeFromHouse(guildId, amount, reason, adminId) {
  const gid = resolveGuildId(guildId);
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0) throw new Error('Amount must be a positive integer.');
  await tx(async c => {
    const row = await c.query('SELECT chips FROM guild_house WHERE guild_id = $1', [gid]);
    const chips = Number(row?.rows?.[0]?.chips || 0);
    if (chips < amt) throw new Error('INSUFFICIENT_HOUSE');
    await c.query('UPDATE guild_house SET chips = chips - $1, updated_at = NOW() WHERE guild_id = $2', [amt, gid]);
    await c.query(
      'INSERT INTO transactions (guild_id, account, delta, reason, admin_id, currency) VALUES ($1,$2,$3,$4,$5,$6)',
      [gid, 'HOUSE', -amt, reason || 'house remove', adminId || null, 'CHIPS']
    );
  });
  return getHouseBalance(gid);
}

export async function transferFromHouseToUser(guildId, discordId, amount, reason, adminId) {
  const gid = resolveGuildId(guildId);
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0) throw new Error('Amount must be a positive integer.');
  await tx(async c => {
    const row = await c.query('SELECT chips FROM guild_house WHERE guild_id = $1', [gid]);
    const chips = Number(row?.rows?.[0]?.chips || 0);
    if (chips < amt) throw new Error('INSUFFICIENT_HOUSE');
    await c.query('INSERT INTO users (guild_id, discord_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [gid, discordId]);
    await c.query('UPDATE guild_house SET chips = chips - $1, updated_at = NOW() WHERE guild_id = $2', [amt, gid]);
    await c.query('UPDATE users SET chips = chips + $1, updated_at = NOW() WHERE guild_id = $2 AND discord_id = $3', [amt, gid, discordId]);
    await c.query(
      'INSERT INTO transactions (guild_id, account, delta, reason, admin_id, currency) VALUES ($1,$2,$3,$4,$5,$6)',
      [gid, discordId, amt, reason || 'admin grant', adminId || null, 'CHIPS']
    );
    await c.query(
      'INSERT INTO transactions (guild_id, account, delta, reason, admin_id, currency) VALUES ($1,$2,$3,$4,$5,$6)',
      [gid, 'HOUSE', -amt, `grant to ${discordId}${reason ? ': ' + reason : ''}`, adminId || null, 'CHIPS']
    );
  });
  const bal = await getUserBalances(gid, discordId);
  return { ...bal, house: await getHouseBalance(gid) };
}

export async function takeFromUserToHouse(guildId, discordId, amount, reason, adminId) {
  const gid = resolveGuildId(guildId);
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0) throw new Error('Amount must be a positive integer.');
  await tx(async c => {
    const row = await c.query('SELECT chips FROM users WHERE guild_id = $1 AND discord_id = $2', [gid, discordId]);
    const chips = Number(row?.rows?.[0]?.chips || 0);
    if (chips < amt) throw new Error('INSUFFICIENT_USER');
    await c.query('UPDATE users SET chips = chips - $1, updated_at = NOW() WHERE guild_id = $2 AND discord_id = $3', [amt, gid, discordId]);
    await c.query('INSERT INTO guild_house (guild_id) VALUES ($1) ON CONFLICT DO NOTHING', [gid]);
    await c.query('UPDATE guild_house SET chips = chips + $1, updated_at = NOW() WHERE guild_id = $2', [amt, gid]);
    await c.query(
      'INSERT INTO transactions (guild_id, account, delta, reason, admin_id, currency) VALUES ($1,$2,$3,$4,$5,$6)',
      [gid, discordId, -amt, reason || 'game stake', adminId || null, 'CHIPS']
    );
    await c.query(
      'INSERT INTO transactions (guild_id, account, delta, reason, admin_id, currency) VALUES ($1,$2,$3,$4,$5,$6)',
      [gid, 'HOUSE', amt, `stake from ${discordId}${reason ? ': ' + reason : ''}`, adminId || null, 'CHIPS']
    );
  });
  const bal = await getUserBalances(gid, discordId);
  return { ...bal, house: await getHouseBalance(gid) };
}

export async function burnFromUser(guildId, discordId, amount, reason, adminId) {
  const gid = resolveGuildId(guildId);
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0) throw new Error('Amount must be a positive integer.');
  await tx(async c => {
    const row = await c.query('SELECT chips FROM users WHERE guild_id = $1 AND discord_id = $2', [gid, discordId]);
    const chips = Number(row?.rows?.[0]?.chips || 0);
    if (chips < amt) throw new Error('INSUFFICIENT_USER');
    await c.query('UPDATE users SET chips = chips - $1, updated_at = NOW() WHERE guild_id = $2 AND discord_id = $3', [amt, gid, discordId]);
    await c.query(
      'INSERT INTO transactions (guild_id, account, delta, reason, admin_id, currency) VALUES ($1,$2,$3,$4,$5,$6)',
      [gid, discordId, -amt, reason || 'admin burn chips', adminId || null, 'CHIPS']
    );
    await c.query(
      'INSERT INTO transactions (guild_id, account, delta, reason, admin_id, currency) VALUES ($1,$2,$3,$4,$5,$6)',
      [gid, 'BURN', amt, `burn chips from ${discordId}${reason ? ': ' + reason : ''}`, adminId || null, 'CHIPS']
    );
  });
  return getUserBalances(gid, discordId);
}

export async function mintChips(guildId, discordId, amount, reason, adminId) {
  const gid = resolveGuildId(guildId);
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0) throw new Error('Amount must be a positive integer.');
  await tx(async c => {
    await c.query('INSERT INTO users (guild_id, discord_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [gid, discordId]);
    await c.query('UPDATE users SET chips = chips + $1, updated_at = NOW() WHERE guild_id = $2 AND discord_id = $3', [amt, gid, discordId]);
    await c.query(
      'INSERT INTO transactions (guild_id, account, delta, reason, admin_id, currency) VALUES ($1,$2,$3,$4,$5,$6)',
      [gid, discordId, amt, reason || 'admin mint chips', adminId || null, 'CHIPS']
    );
  });
  return getUserBalances(gid, discordId);
}

export async function recordVoteReward(discordId, source, amount, metadata = {}, earnedAt = Math.floor(Date.now() / 1000), externalId = null) {
  const userId = String(discordId || '').trim();
  const src = String(source || '').trim();
  if (!userId) throw new Error('VOTE_REWARD_USER_REQUIRED');
  if (!src) throw new Error('VOTE_REWARD_SOURCE_REQUIRED');
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0) throw new Error('VOTE_REWARD_AMOUNT_POSITIVE');
  const ts = Number.isInteger(earnedAt) && earnedAt > 0 ? earnedAt : Math.floor(Date.now() / 1000);
  const meta = metadata && Object.keys(metadata).length ? JSON.stringify(metadata) : null;
  const extId = externalId ? String(externalId).trim() || null : null;
  try {
    await q(
      'INSERT INTO vote_rewards (discord_user_id, source, reward_amount, metadata_json, earned_at, external_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [userId, src, amt, meta, ts, extId]
    );
    return true;
  } catch (err) {
    if (err?.code === '23505') return false;
    throw err;
  }
}

export async function getPendingVoteRewards(discordId) {
  const userId = String(discordId || '').trim();
  if (!userId) return [];
  const rows = await q(
    'SELECT id, source, reward_amount, earned_at, metadata_json FROM vote_rewards WHERE discord_user_id = $1 AND claimed_at IS NULL ORDER BY earned_at ASC, id ASC',
    [userId]
  );
  return rows.map(mapVoteRow).filter(Boolean);
}

export async function redeemVoteRewards(guildId, discordId, options = {}) {
  const userId = String(discordId || '').trim();
  if (!userId) throw new Error('VOTE_REWARD_USER_REQUIRED');
  let guildHint = guildId;
  if (typeof guildHint === 'string') {
    guildHint = guildHint.trim();
    if (!guildHint) guildHint = null;
  }
  if (!USE_GLOBAL_ECONOMY) {
    const needsLookup = !guildHint || guildHint === DEFAULT_GUILD_ID;
    if (needsLookup) {
      const existing = await q1(
        'SELECT guild_id FROM users WHERE discord_id = $1 ORDER BY updated_at DESC LIMIT 1',
        [userId]
      );
      if (existing?.guild_id) guildHint = existing.guild_id;
    }
  }
  const gid = resolveGuildId(guildHint);
  const reason = options?.reason ? String(options.reason) : 'vote reward';
  const adminId = options?.adminId ? String(options.adminId) : null;
  const limit = Number.isInteger(options?.limit) && options.limit > 0 ? options.limit : null;

  return tx(async c => {
    await c.query('INSERT INTO users (guild_id, discord_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [gid, userId]);
    const pendingRes = await c.query(
      'SELECT id, source, reward_amount, earned_at, metadata_json FROM vote_rewards WHERE discord_user_id = $1 AND claimed_at IS NULL ORDER BY earned_at ASC, id ASC',
      [userId]
    );
    const pendingRows = pendingRes.rows || [];
    const selected = limit ? pendingRows.slice(0, limit) : pendingRows;
    if (!selected.length) {
      const balRes = await c.query('SELECT chips, credits FROM users WHERE guild_id = $1 AND discord_id = $2', [gid, userId]);
      const balRow = balRes.rows?.[0] || { chips: 0, credits: 0 };
      return {
        claimedTotal: 0,
        claimedCount: 0,
        claimedRewards: [],
        balances: { chips: Number(balRow.chips || 0), credits: Number(balRow.credits || 0) },
        remaining: pendingRows.length
      };
    }

    let total = 0;
    for (const row of selected) total += Number(row.reward_amount || 0);
    if (!Number.isInteger(total) || total <= 0) {
      const balRes = await c.query('SELECT chips, credits FROM users WHERE guild_id = $1 AND discord_id = $2', [gid, userId]);
      const balRow = balRes.rows?.[0] || { chips: 0, credits: 0 };
      return {
        claimedTotal: 0,
        claimedCount: 0,
        claimedRewards: [],
        balances: { chips: Number(balRow.chips || 0), credits: Number(balRow.credits || 0) },
        remaining: pendingRows.length
      };
    }

    await c.query('UPDATE users SET chips = chips + $1, updated_at = NOW() WHERE guild_id = $2 AND discord_id = $3', [total, gid, userId]);
    await c.query(
      'INSERT INTO transactions (guild_id, account, delta, reason, admin_id, currency) VALUES ($1,$2,$3,$4,$5,$6)',
      [gid, userId, total, reason || 'vote reward', adminId || null, 'CHIPS']
    );
    const now = Math.floor(Date.now() / 1000);
    for (const row of selected) {
      await c.query('UPDATE vote_rewards SET claimed_at = $1, claim_guild_id = $2 WHERE id = $3', [now, gid, row.id]);
    }
    const balRes = await c.query('SELECT chips, credits FROM users WHERE guild_id = $1 AND discord_id = $2', [gid, userId]);
    const balRow = balRes.rows?.[0] || { chips: 0, credits: 0 };
    return {
      claimedTotal: total,
      claimedCount: selected.length,
      claimedRewards: selected.map(mapVoteRow).filter(Boolean),
      balances: { chips: Number(balRow.chips || 0), credits: Number(balRow.credits || 0) },
      remaining: pendingRows.length - selected.length
    };
  });
}

export async function listUsersWithPendingVoteRewards(limit = 50) {
  const n = Math.max(1, Math.min(500, Number(limit) || 50));
  const rows = await q(
    `SELECT discord_user_id
     FROM vote_rewards
     WHERE claimed_at IS NULL
     GROUP BY discord_user_id
     ORDER BY MIN(earned_at) ASC, MIN(id) ASC
     LIMIT $1`,
    [n]
  );
  return rows.map(row => row.discord_user_id);
}

export async function eraseUserData(discordId) {
  const userId = String(discordId || '').trim();
  if (!userId) throw new Error('ERASE_USER_ID_REQUIRED');
  return tx(async c => {
    const deleted = {};
    deleted.users = (await c.query('DELETE FROM users WHERE discord_id = $1', [userId])).rowCount;
    deleted.transactions = (await c.query('DELETE FROM transactions WHERE account = $1', [userId])).rowCount;
    deleted.dailySpin = (await c.query('DELETE FROM daily_spin_last WHERE user_id = $1', [userId])).rowCount;
    deleted.requestLast = (await c.query('DELETE FROM request_last WHERE user_id = $1', [userId])).rowCount;
    deleted.voteRewards = (await c.query('DELETE FROM vote_rewards WHERE discord_user_id = $1', [userId])).rowCount;
    deleted.jobProfiles = (await c.query('DELETE FROM job_profiles WHERE user_id = $1', [userId])).rowCount;
    deleted.jobStatus = (await c.query('DELETE FROM job_status WHERE user_id = $1', [userId])).rowCount;
    deleted.jobShifts = (await c.query('DELETE FROM job_shifts WHERE user_id = $1', [userId])).rowCount;
    deleted.activeRequests = (await c.query('DELETE FROM active_requests WHERE user_id = $1', [userId])).rowCount;
    deleted.holdemEscrow = (await c.query('DELETE FROM holdem_escrow WHERE user_id = $1', [userId])).rowCount;
    deleted.holdemCommits = (await c.query('DELETE FROM holdem_commits WHERE user_id = $1', [userId])).rowCount;
    deleted.modAssignments = (await c.query('DELETE FROM mod_users WHERE user_id = $1', [userId])).rowCount;
    deleted.adminAssignments = (await c.query('DELETE FROM admin_users WHERE user_id = $1', [userId])).rowCount;
    deleted.onboarding = (await c.query('DELETE FROM user_onboarding WHERE user_id = $1', [userId])).rowCount;
    const updated = {};
    updated.transactionsAdmin = (await c.query('UPDATE transactions SET admin_id = NULL WHERE admin_id = $1', [userId])).rowCount;
    updated.holdemTablesHost = (await c.query('UPDATE holdem_tables SET host_id = NULL WHERE host_id = $1', [userId])).rowCount;
    return { userId, deleted, updated };
  });
}

export async function grantCredits(guildId, discordId, amount, reason, adminId) {
  const gid = resolveGuildId(guildId);
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0) throw new Error('Amount must be a positive integer.');
  await tx(async c => {
    await c.query('INSERT INTO users (guild_id, discord_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [gid, discordId]);
    await c.query('UPDATE users SET credits = credits + $1, updated_at = NOW() WHERE guild_id = $2 AND discord_id = $3', [amt, gid, discordId]);
    await c.query(
      'INSERT INTO transactions (guild_id, account, delta, reason, admin_id, currency) VALUES ($1,$2,$3,$4,$5,$6)',
      [gid, discordId, amt, reason || 'admin grant credits', adminId || null, 'CREDITS']
    );
  });
  return getUserBalances(gid, discordId);
}

export async function burnCredits(guildId, discordId, amount, reason, adminId) {
  const gid = resolveGuildId(guildId);
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0) throw new Error('Amount must be a positive integer.');
  await tx(async c => {
    const row = await c.query('SELECT credits FROM users WHERE guild_id = $1 AND discord_id = $2', [gid, discordId]);
    const credits = Number(row?.rows?.[0]?.credits || 0);
    if (credits < amt) throw new Error('INSUFFICIENT_USER_CREDITS');
    await c.query('UPDATE users SET credits = credits - $1, updated_at = NOW() WHERE guild_id = $2 AND discord_id = $3', [amt, gid, discordId]);
    await c.query(
      'INSERT INTO transactions (guild_id, account, delta, reason, admin_id, currency) VALUES ($1,$2,$3,$4,$5,$6)',
      [gid, discordId, -amt, reason || 'admin burn credits', adminId || null, 'CREDITS']
    );
    await c.query(
      'INSERT INTO transactions (guild_id, account, delta, reason, admin_id, currency) VALUES ($1,$2,$3,$4,$5,$6)',
      [gid, 'BURN', amt, `burn credits from ${discordId}${reason ? ': ' + reason : ''}`, adminId || null, 'CREDITS']
    );
  });
  return getUserBalances(gid, discordId);
}

export async function gameLoseWithCredits(guildId, discordId, amount, detail) {
  const gid = resolveGuildId(guildId);
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0) throw new Error('Amount must be a positive integer.');
  await tx(async c => {
    const row = await c.query('SELECT credits FROM users WHERE guild_id = $1 AND discord_id = $2', [gid, discordId]);
    const credits = Number(row?.rows?.[0]?.credits || 0);
    if (credits < amt) throw new Error('INSUFFICIENT_USER_CREDITS');
    await c.query('UPDATE users SET credits = credits - $1, updated_at = NOW() WHERE guild_id = $2 AND discord_id = $3', [amt, gid, discordId]);
    await c.query(
      'INSERT INTO transactions (guild_id, account, delta, reason, admin_id, currency) VALUES ($1,$2,$3,$4,$5,$6)',
      [gid, discordId, -amt, `game loss (credits)${detail ? ': ' + detail : ''}`, null, 'CREDITS']
    );
    await c.query(
      'INSERT INTO transactions (guild_id, account, delta, reason, admin_id, currency) VALUES ($1,$2,$3,$4,$5,$6)',
      [gid, 'BURN', amt, `game loss from ${discordId}${detail ? ': ' + detail : ''}`, null, 'CREDITS']
    );
  });
  return getUserBalances(gid, discordId);
}

export async function gameWinWithCredits(guildId, discordId, amount, detail) {
  return transferFromHouseToUser(guildId, discordId, amount, `game win (credits)${detail ? ': ' + detail : ''}`, null);
}

// --- Guild settings (unchanged structure) ---
function normalizeSettings(row) {
  if (!row) return { log_channel_id: null, cash_log_channel_id: null, request_channel_id: null, update_channel_id: null, request_cooldown_sec: 0, logging_enabled: 0, max_ridebus_bet: 1000, casino_category_id: null, holdem_rake_bps: 0, holdem_rake_cap: 0, kitten_mode_enabled: 0 };
  return {
    log_channel_id: row.log_channel_id || null,
    cash_log_channel_id: row.cash_log_channel_id || null,
    request_channel_id: row.request_channel_id || null,
    update_channel_id: row.update_channel_id || null,
    request_cooldown_sec: Number(row.request_cooldown_sec || 0),
    logging_enabled: row.logging_enabled ? 1 : 0,
    max_ridebus_bet: Number(row.max_ridebus_bet || 1000),
    casino_category_id: row.casino_category_id || null,
    holdem_rake_bps: Number(row.holdem_rake_bps || 0),
    holdem_rake_cap: Number(row.holdem_rake_cap || 0),
    kitten_mode_enabled: row.kitten_mode_enabled ? 1 : 0
  };
}

export async function getGuildSettings(guildId) {
  const row = await q1('SELECT * FROM guild_settings WHERE guild_id = $1', [guildId]);
  return normalizeSettings(row);
}

async function upsertGuildSettings(fields) {
  const keys = ['log_channel_id','cash_log_channel_id','request_channel_id','update_channel_id','request_cooldown_sec','logging_enabled','max_ridebus_bet','casino_category_id','holdem_rake_bps','holdem_rake_cap','kitten_mode_enabled'];
  const vals = keys.map(k => fields[k] ?? null);
  await q('INSERT INTO guild_settings (guild_id) VALUES ($1) ON CONFLICT (guild_id) DO NOTHING', [fields.guild_id]);
  const updates = keys.map((k, i) => `${k} = COALESCE($${i + 2}, ${k})`).join(', ');
  await q(`UPDATE guild_settings SET ${updates}, updated_at = NOW() WHERE guild_id = $1`, [fields.guild_id, ...vals]);
}

export async function setGameLogChannel(guildId, channelId) { await upsertGuildSettings({ guild_id: guildId, log_channel_id: channelId }); return getGuildSettings(guildId); }
export async function setCashLogChannel(guildId, channelId) { await upsertGuildSettings({ guild_id: guildId, cash_log_channel_id: channelId }); return getGuildSettings(guildId); }
export async function setRequestChannel(guildId, channelId) { await upsertGuildSettings({ guild_id: guildId, request_channel_id: channelId }); return getGuildSettings(guildId); }
export async function setUpdateChannel(guildId, channelId) { await upsertGuildSettings({ guild_id: guildId, update_channel_id: channelId }); return getGuildSettings(guildId); }
export async function setRequestTimer(guildId, seconds) { await upsertGuildSettings({ guild_id: guildId, request_cooldown_sec: Math.max(0, Number(seconds) || 0) }); return getGuildSettings(guildId); }
export async function setLoggingEnabled(guildId, enabled) { await upsertGuildSettings({ guild_id: guildId, logging_enabled: !!enabled }); return getGuildSettings(guildId); }
export async function setMaxRidebusBet(guildId, amount) { await upsertGuildSettings({ guild_id: guildId, max_ridebus_bet: Math.max(1, Number(amount) || 1) }); return getGuildSettings(guildId); }
export async function setCasinoCategory(guildId, categoryId) { await upsertGuildSettings({ guild_id: guildId, casino_category_id: categoryId }); return getGuildSettings(guildId); }
export async function setDefaultHoldemRake(guildId, rakeBps, rakeCap = 0) { await upsertGuildSettings({ guild_id: guildId, holdem_rake_bps: Math.max(0, Number(rakeBps) || 0), holdem_rake_cap: Math.max(0, Number(rakeCap) || 0) }); return getGuildSettings(guildId); }
export async function setKittenMode(guildId, enabled) { await upsertGuildSettings({ guild_id: guildId, kitten_mode_enabled: !!enabled }); return getGuildSettings(guildId); }
export async function isKittenModeEnabled(guildId) { const settings = await getGuildSettings(guildId); return !!(settings && settings.kitten_mode_enabled); }

// --- Active Requests ---
export async function getActiveRequest(guildId, userId) {
  return (await q1('SELECT guild_id, user_id, message_id, type, amount, status FROM active_requests WHERE guild_id = $1 AND user_id = $2', [guildId, userId])) || null;
}
export async function createActiveRequest(guildId, userId, messageId, type, amount) {
  if (!guildId || !userId || !messageId) throw new Error('ACTIVE_REQ_PARAMS');
  const normalizedType = String(type || 'unknown');
  let normalizedAmount = Number.isInteger(Number(amount)) ? Number(amount) : 0;
  if (normalizedType !== 'erase' && (!Number.isInteger(normalizedAmount) || normalizedAmount <= 0)) throw new Error('ACTIVE_REQ_AMOUNT');
  if (normalizedType === 'erase') normalizedAmount = 0;
  if (await getActiveRequest(guildId, userId)) throw new Error('ACTIVE_REQ_EXISTS');
  await q('INSERT INTO active_requests (guild_id, user_id, message_id, type, amount, status) VALUES ($1,$2,$3,$4,$5,$6)', [guildId, userId, messageId, normalizedType, normalizedAmount, 'PENDING']);
  return getActiveRequest(guildId, userId);
}
export async function updateActiveRequestStatus(guildId, userId, status) {
  await q('UPDATE active_requests SET status = $1, updated_at = NOW() WHERE guild_id = $2 AND user_id = $3', [String(status || 'PENDING'), guildId, userId]);
  return getActiveRequest(guildId, userId);
}
export async function clearActiveRequest(guildId, userId) {
  await q('DELETE FROM active_requests WHERE guild_id = $1 AND user_id = $2', [guildId, userId]);
  return true;
}

function secondsNow() {
  return Math.floor(Date.now() / 1000);
}

function normalizeJobProfileRow(guildId, userId, jobId, row = {}) {
  return {
    guildId,
    userId,
    jobId,
    rank: Math.max(1, intValue(row?.rank, 1)),
    totalXp: Math.max(0, intValue(row?.total_xp, 0)),
    xpToNext: Math.max(0, intValue(row?.xp_to_next, 100)),
    lastShiftAt: row?.last_shift_at !== null && row?.last_shift_at !== undefined ? intValue(row.last_shift_at, null) : null,
    createdAt: intValue(row?.created_at, 0),
    updatedAt: intValue(row?.updated_at, 0)
  };
}

function normalizeJobShiftRow(row = null) {
  if (!row) return null;
  return {
    id: row.id,
    guildId: row.guild_id,
    userId: row.user_id,
    jobId: row.job_id,
    startedAt: intValue(row.started_at, 0),
    completedAt: row.completed_at !== null && row.completed_at !== undefined ? intValue(row.completed_at, null) : null,
    performanceScore: intValue(row.performance_score, 0),
    basePay: intValue(row.base_pay, 0),
    tipPercent: intValue(row.tip_percent, 0),
    tipAmount: intValue(row.tip_amount, 0),
    totalPayout: intValue(row.total_payout, 0),
    resultState: row.result_state || 'PENDING',
    metadata: row.metadata_json ? row.metadata_json : {}
  };
}

async function ensureJobProfileRow(guildId, userId, jobId) {
  await q('INSERT INTO job_profiles (guild_id, user_id, job_id) VALUES ($1,$2,$3) ON CONFLICT (guild_id, user_id, job_id) DO NOTHING', [guildId, userId, jobId]);
}

export async function ensureJobProfile(guildId, userId, jobId) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  const jid = String(jobId || '').trim();
  if (!uid) throw new Error('JOB_PROFILE_USER_REQUIRED');
  if (!jid) throw new Error('JOB_PROFILE_JOB_REQUIRED');
  await ensureJobProfileRow(gid, uid, jid);
  const row = await q1('SELECT guild_id, user_id, job_id, rank, total_xp, xp_to_next, last_shift_at, created_at, updated_at FROM job_profiles WHERE guild_id = $1 AND user_id = $2 AND job_id = $3', [gid, uid, jid]);
  return normalizeJobProfileRow(gid, uid, jid, row || {});
}

export async function getJobProfile(guildId, userId, jobId) {
  return ensureJobProfile(guildId, userId, jobId);
}

export async function listJobProfilesForUser(guildId, userId) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('JOB_PROFILE_USER_REQUIRED');
  const rows = await q('SELECT guild_id, user_id, job_id, rank, total_xp, xp_to_next, last_shift_at, created_at, updated_at FROM job_profiles WHERE guild_id = $1 AND user_id = $2 ORDER BY job_id ASC', [gid, uid]);
  return rows.map(row => normalizeJobProfileRow(gid, uid, row.job_id, row));
}

export async function updateJobProfile(guildId, userId, jobId, patch = {}) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  const jid = String(jobId || '').trim();
  if (!uid) throw new Error('JOB_PROFILE_USER_REQUIRED');
  if (!jid) throw new Error('JOB_PROFILE_JOB_REQUIRED');
  await ensureJobProfileRow(gid, uid, jid);
  const current = await q1('SELECT rank, total_xp, xp_to_next, last_shift_at FROM job_profiles WHERE guild_id = $1 AND user_id = $2 AND job_id = $3', [gid, uid, jid]) || {};
  const nextRank = patch.rank !== undefined ? Math.max(1, intValue(patch.rank, current.rank || 1)) : Math.max(1, intValue(current.rank, 1));
  const nextTotal = patch.totalXp !== undefined ? Math.max(0, intValue(patch.totalXp, current.total_xp || 0)) : Math.max(0, intValue(current.total_xp, 0));
  const nextXpToNext = patch.xpToNext !== undefined ? Math.max(0, intValue(patch.xpToNext, current.xp_to_next || 0)) : Math.max(0, intValue(current.xp_to_next, 0));
  const nextLastShift = patch.lastShiftAt === undefined
    ? (current.last_shift_at !== undefined ? current.last_shift_at : null)
    : (patch.lastShiftAt === null ? null : intValue(patch.lastShiftAt, null));
  const updatedAt = patch.updatedAt !== undefined ? intValue(patch.updatedAt, secondsNow()) : secondsNow();
  await q(
    'UPDATE job_profiles SET rank = $1, total_xp = $2, xp_to_next = $3, last_shift_at = $4, updated_at = $5 WHERE guild_id = $6 AND user_id = $7 AND job_id = $8',
    [nextRank, nextTotal, nextXpToNext, nextLastShift, updatedAt, gid, uid, jid]
  );
  const row = await q1('SELECT guild_id, user_id, job_id, rank, total_xp, xp_to_next, last_shift_at, created_at, updated_at FROM job_profiles WHERE guild_id = $1 AND user_id = $2 AND job_id = $3', [gid, uid, jid]);
  return normalizeJobProfileRow(gid, uid, jid, row || {});
}

export async function createJobShift(guildId, userId, jobId, options = {}) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  const jid = String(jobId || '').trim();
  if (!uid) throw new Error('JOB_SHIFT_USER_REQUIRED');
  if (!jid) throw new Error('JOB_SHIFT_JOB_REQUIRED');
  await ensureJobProfileRow(gid, uid, jid);
  const id = options.shiftId ? String(options.shiftId) : crypto.randomUUID();
  const startedAt = options.startedAt !== undefined ? intValue(options.startedAt, secondsNow()) : secondsNow();
  const metadata = options.metadata !== undefined ? options.metadata : {};
  await q('INSERT INTO job_shifts (id, guild_id, user_id, job_id, started_at, metadata_json) VALUES ($1,$2,$3,$4,$5,$6)', [id, gid, uid, jid, startedAt, metadata]);
  const row = await q1('SELECT id, guild_id, user_id, job_id, started_at, completed_at, performance_score, base_pay, tip_percent, tip_amount, total_payout, result_state, metadata_json FROM job_shifts WHERE id = $1', [id]);
  return normalizeJobShiftRow(row);
}

export async function completeJobShift(shiftId, updates = {}) {
  const id = String(shiftId || '').trim();
  if (!id) throw new Error('JOB_SHIFT_ID_REQUIRED');
  const existing = await q1('SELECT * FROM job_shifts WHERE id = $1', [id]);
  if (!existing) throw new Error('JOB_SHIFT_NOT_FOUND');
  const completedAt = updates.completedAt !== undefined ? intValue(updates.completedAt, secondsNow()) : secondsNow();
  const performance = updates.performanceScore !== undefined ? intValue(updates.performanceScore, existing.performance_score || 0) : intValue(existing.performance_score, 0);
  const basePay = updates.basePay !== undefined ? intValue(updates.basePay, existing.base_pay || 0) : intValue(existing.base_pay, 0);
  const tipPercent = updates.tipPercent !== undefined ? intValue(updates.tipPercent, existing.tip_percent || 0) : intValue(existing.tip_percent, 0);
  const tipAmount = updates.tipAmount !== undefined ? intValue(updates.tipAmount, existing.tip_amount || 0) : intValue(existing.tip_amount, 0);
  const totalPayoutRaw = updates.totalPayout !== undefined ? intValue(updates.totalPayout, existing.total_payout || 0) : (basePay + tipAmount);
  const totalPayout = intValue(totalPayoutRaw, basePay + tipAmount);
  const resultState = (updates.resultState || existing.result_state || 'PENDING').toUpperCase();
  const metadata = updates.metadata !== undefined ? updates.metadata : (existing.metadata_json || {});
  await q(
    'UPDATE job_shifts SET completed_at = $1, performance_score = $2, base_pay = $3, tip_percent = $4, tip_amount = $5, total_payout = $6, result_state = $7, metadata_json = $8 WHERE id = $9',
    [completedAt, performance, basePay, tipPercent, tipAmount, totalPayout, resultState, metadata, id]
  );
  const row = await q1('SELECT id, guild_id, user_id, job_id, started_at, completed_at, performance_score, base_pay, tip_percent, tip_amount, total_payout, result_state, metadata_json FROM job_shifts WHERE id = $1', [id]);
  return normalizeJobShiftRow(row);
}

export async function getJobShiftById(shiftId) {
  const id = String(shiftId || '').trim();
  if (!id) throw new Error('JOB_SHIFT_ID_REQUIRED');
  const row = await q1('SELECT id, guild_id, user_id, job_id, started_at, completed_at, performance_score, base_pay, tip_percent, tip_amount, total_payout, result_state, metadata_json FROM job_shifts WHERE id = $1', [id]);
  return normalizeJobShiftRow(row);
}

export async function listJobShiftsForUser(guildId, userId, limit = 20) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('JOB_SHIFT_USER_REQUIRED');
  const lim = Math.max(1, Math.min(100, Number(limit) || 20));
  const rows = await q('SELECT id, guild_id, user_id, job_id, started_at, completed_at, performance_score, base_pay, tip_percent, tip_amount, total_payout, result_state, metadata_json FROM job_shifts WHERE guild_id = $1 AND user_id = $2 ORDER BY started_at DESC LIMIT $3', [gid, uid, lim]);
  return rows.map(normalizeJobShiftRow);
}

function intValue(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.trunc(num);
}

function nullableInt(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
}

async function ensureJobStatusRow(guildId, userId) {
  await q('INSERT INTO job_status (guild_id, user_id) VALUES ($1, $2) ON CONFLICT (guild_id, user_id) DO NOTHING', [guildId, userId]);
}

function normalizeJobStatusRow(guildId, userId, row = {}) {
  return {
    guild_id: guildId,
    user_id: userId,
    active_job: row?.active_job || 'none',
    job_switch_available_at: intValue(row?.job_switch_available_at, 0),
    cooldown_reason: row?.cooldown_reason || null,
    daily_earning_cap: nullableInt(row?.daily_earning_cap),
    earned_today: intValue(row?.earned_today, 0),
    cap_reset_at: nullableInt(row?.cap_reset_at),
    shift_streak_count: intValue(row?.shift_streak_count, 0),
    shift_cooldown_expires_at: intValue(row?.shift_cooldown_expires_at, 0),
    updated_at: intValue(row?.updated_at, 0)
  };
}

export async function getJobStatus(guildId, userId) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('JOB_STATUS_USER_REQUIRED');
  await ensureJobStatusRow(gid, uid);
  const row = await q1(
    'SELECT active_job, job_switch_available_at, cooldown_reason, daily_earning_cap, earned_today, cap_reset_at, shift_streak_count, shift_cooldown_expires_at, updated_at FROM job_status WHERE guild_id = $1 AND user_id = $2',
    [gid, uid]
  );
  return normalizeJobStatusRow(gid, uid, row || {});
}

export async function setJobStatus(guildId, userId, patch = {}) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('JOB_STATUS_USER_REQUIRED');
  await ensureJobStatusRow(gid, uid);
  const current = await q1(
    'SELECT active_job, job_switch_available_at, cooldown_reason, daily_earning_cap, earned_today, cap_reset_at, shift_streak_count, shift_cooldown_expires_at FROM job_status WHERE guild_id = $1 AND user_id = $2',
    [gid, uid]
  ) || {};
  const now = Math.floor(Date.now() / 1000);
  const next = {
    active_job: patch.active_job ?? current.active_job ?? 'none',
    job_switch_available_at: intValue(patch.job_switch_available_at ?? current.job_switch_available_at, 0),
    cooldown_reason: patch.cooldown_reason === undefined ? (current.cooldown_reason ?? null) : patch.cooldown_reason,
    daily_earning_cap: patch.daily_earning_cap === undefined ? (current.daily_earning_cap ?? null) : patch.daily_earning_cap,
    earned_today: intValue(patch.earned_today ?? current.earned_today, 0),
    cap_reset_at: patch.cap_reset_at === undefined ? (current.cap_reset_at ?? null) : patch.cap_reset_at,
    shift_streak_count: intValue(patch.shift_streak_count ?? current.shift_streak_count, 0),
    shift_cooldown_expires_at: intValue(patch.shift_cooldown_expires_at ?? current.shift_cooldown_expires_at, 0)
  };
  await q(
    `UPDATE job_status
     SET active_job = $1,
         job_switch_available_at = $2,
         cooldown_reason = $3,
         daily_earning_cap = $4,
         earned_today = $5,
         cap_reset_at = $6,
         shift_streak_count = $7,
         shift_cooldown_expires_at = $8,
         updated_at = $9
     WHERE guild_id = $10 AND user_id = $11`,
    [
      next.active_job,
      intValue(next.job_switch_available_at, 0),
      next.cooldown_reason ?? null,
      nullableInt(next.daily_earning_cap),
      intValue(next.earned_today, 0),
      nullableInt(next.cap_reset_at),
      intValue(next.shift_streak_count, 0),
      intValue(next.shift_cooldown_expires_at, 0),
      now,
      gid,
      uid
    ]
  );
  return getJobStatus(gid, uid);
}

// --- Hold’em helpers ---
async function guildForTable(tableId) {
  const row = await q1('SELECT guild_id FROM holdem_tables WHERE table_id = $1', [String(tableId)]);
  return resolveGuildId(row?.guild_id);
}

export async function ensureHoldemTable(params) {
  const { tableId, guildId, channelId, sb, bb, min, max, rakeBps, hostId } = params;
  await q(
    `INSERT INTO holdem_tables (table_id, guild_id, channel_id, sb, bb, min, max, rake_bps, host_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (table_id) DO UPDATE SET guild_id = EXCLUDED.guild_id, channel_id = EXCLUDED.channel_id,
       sb = EXCLUDED.sb, bb = EXCLUDED.bb, min = EXCLUDED.min, max = EXCLUDED.max, rake_bps = EXCLUDED.rake_bps, host_id = EXCLUDED.host_id`,
    [String(tableId), String(guildId), String(channelId), Number(sb) || 0, Number(bb) || 0, Number(min) || 0, Number(max) || 0, Number(rakeBps) || 0, hostId ? String(hostId) : null]
  );
  return { tableId: String(tableId) };
}

export async function createHoldemHand(tableId, handNo, board = '', winnersJson = '[]', rakePaid = 0) {
  const row = await q1(
    'INSERT INTO holdem_hands (table_id, hand_no, board, winners_json, rake_paid) VALUES ($1,$2,$3,$4,$5) RETURNING hand_id',
    [String(tableId), Number(handNo) || 0, String(board || ''), String(winnersJson || '[]'), Number(rakePaid) || 0]
  );
  return Number(row?.hand_id || 0);
}

export async function getEscrowBalance(tableId, userId) {
  const row = await q1('SELECT balance FROM holdem_escrow WHERE table_id = $1 AND user_id = $2', [String(tableId), String(userId)]);
  return Number(row?.balance || 0);
}

export async function escrowAdd(tableId, userId, amount) {
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0) throw new Error('ESCROW_POSITIVE');
  const gid = await guildForTable(tableId);
  await tx(async c => {
    const row = await c.query('SELECT chips FROM users WHERE guild_id = $1 AND discord_id = $2', [gid, String(userId)]);
    const chips = Number(row?.rows?.[0]?.chips || 0);
    if (chips < amt) throw new Error('INSUFFICIENT_USER');
    await c.query('UPDATE users SET chips = chips - $1, updated_at = NOW() WHERE guild_id = $2 AND discord_id = $3', [amt, gid, String(userId)]);
    await c.query(
      'INSERT INTO holdem_escrow (table_id, user_id, balance) VALUES ($1,$2,$3) ON CONFLICT (table_id, user_id) DO UPDATE SET balance = holdem_escrow.balance + EXCLUDED.balance',
      [String(tableId), String(userId), amt]
    );
    await c.query(
      'INSERT INTO transactions (guild_id, account, delta, reason, currency) VALUES ($1,$2,$3,$4,$5)',
      [gid, String(userId), -amt, `holdem buy-in escrow ${tableId}`, 'CHIPS']
    );
    await c.query(
      'INSERT INTO transactions (guild_id, account, delta, reason, currency) VALUES ($1,$2,$3,$4,$5)',
      [gid, `ESCROW:${tableId}`, amt, `holdem buy-in from ${userId}`, 'CHIPS']
    );
  });
  return { escrow: await getEscrowBalance(tableId, userId), user: (await getUserBalances(gid, userId)).chips };
}

export async function escrowReturn(tableId, userId, amount) {
  const amt = Number(amount);
  if (amt <= 0) return 0;
  const gid = await guildForTable(tableId);
  await tx(async c => {
    const row = await c.query('SELECT balance FROM holdem_escrow WHERE table_id = $1 AND user_id = $2', [String(tableId), String(userId)]);
    const bal = Number(row?.rows?.[0]?.balance || 0);
    const toReturn = Math.min(bal, amt);
    if (toReturn <= 0) return;
    await c.query('UPDATE holdem_escrow SET balance = balance - $1 WHERE table_id = $2 AND user_id = $3', [toReturn, String(tableId), String(userId)]);
    await c.query('UPDATE users SET chips = chips + $1, updated_at = NOW() WHERE guild_id = $2 AND discord_id = $3', [toReturn, gid, String(userId)]);
    await c.query('INSERT INTO transactions (guild_id, account, delta, reason, currency) VALUES ($1,$2,$3,$4,$5)', [gid, `ESCROW:${tableId}`, -toReturn, `holdem refund to ${userId}`, 'CHIPS']);
    await c.query('INSERT INTO transactions (guild_id, account, delta, reason, currency) VALUES ($1,$2,$3,$4,$5)', [gid, String(userId), toReturn, `holdem refund from escrow ${tableId}`, 'CHIPS']);
  });
  return getEscrowBalance(tableId, userId);
}

export async function escrowCommit(tableId, userId, handId, street, amount) {
  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0) return getEscrowBalance(tableId, userId);
  const gid = await guildForTable(tableId);
  await tx(async c => {
    const row = await c.query('SELECT balance FROM holdem_escrow WHERE table_id = $1 AND user_id = $2', [String(tableId), String(userId)]);
    const bal = Number(row?.rows?.[0]?.balance || 0);
    if (bal < amt) throw new Error('ESCROW_INSUFFICIENT');
    await c.query('UPDATE holdem_escrow SET balance = balance - $1 WHERE table_id = $2 AND user_id = $3', [amt, String(tableId), String(userId)]);
    await c.query('INSERT INTO holdem_commits (hand_id, user_id, street, amount) VALUES ($1,$2,$3,$4)', [Number(handId) || 0, String(userId), String(street || 'UNK'), amt]);
    await c.query('INSERT INTO transactions (guild_id, account, delta, reason, currency) VALUES ($1,$2,$3,$4,$5)', [gid, `ESCROW:${tableId}`, -amt, `holdem commit ${street} from ${userId}`, 'CHIPS']);
    await c.query('INSERT INTO transactions (guild_id, account, delta, reason, currency) VALUES ($1,$2,$3,$4,$5)', [gid, `POT:${tableId}`, amt, `holdem commit ${street} from ${userId}`, 'CHIPS']);
  });
  return getEscrowBalance(tableId, userId);
}

export async function escrowCreditMany(tableId, payouts) {
  if (!Array.isArray(payouts) || !payouts.length) return true;
  const gid = await guildForTable(tableId);
  await tx(async c => {
    for (const { userId, amount } of payouts) {
      const amt = Math.max(0, Number(amount) || 0);
      if (amt <= 0) continue;
      await c.query('INSERT INTO holdem_escrow (table_id, user_id, balance) VALUES ($1,$2,$3) ON CONFLICT (table_id,user_id) DO UPDATE SET balance = holdem_escrow.balance + EXCLUDED.balance', [String(tableId), String(userId), amt]);
      await c.query('INSERT INTO transactions (guild_id, account, delta, reason, currency) VALUES ($1,$2,$3,$4,$5)', [gid, `POT:${tableId}`, -amt, `holdem payout to escrow for ${userId}`, 'CHIPS']);
      await c.query('INSERT INTO transactions (guild_id, account, delta, reason, currency) VALUES ($1,$2,$3,$4,$5)', [gid, `ESCROW:${tableId}`, amt, `holdem payout to ${userId}`, 'CHIPS']);
    }
  });
  return true;
}

export async function settleRake(tableId, amount) {
  const amt = Math.max(0, Number(amount) || 0);
  if (amt <= 0) return 0;
  const gid = await guildForTable(tableId);
  await tx(async c => {
    await c.query('INSERT INTO guild_house (guild_id) VALUES ($1) ON CONFLICT DO NOTHING', [gid]);
    await c.query('UPDATE guild_house SET chips = chips + $1, updated_at = NOW() WHERE guild_id = $2', [amt, gid]);
    await c.query('INSERT INTO transactions (guild_id, account, delta, reason, currency) VALUES ($1,$2,$3,$4,$5)', [gid, 'HOUSE', amt, `holdem rake ${tableId}`, 'CHIPS']);
    await c.query('INSERT INTO transactions (guild_id, account, delta, reason, currency) VALUES ($1,$2,$3,$4,$5)', [gid, `POT:${tableId}`, -amt, `holdem rake ${tableId}`, 'CHIPS']);
  });
  return getHouseBalance(gid);
}

export async function finalizeHoldemHand(handId, { board, winnersJson, rakePaid }) {
  await q('UPDATE holdem_hands SET board = $1, winners_json = $2, rake_paid = $3 WHERE hand_id = $4', [String(board || ''), String(winnersJson || '[]'), Number(rakePaid) || 0, Number(handId) || 0]);
}

export async function listEscrowForTable(tableId) {
  const rows = await q('SELECT user_id, balance FROM holdem_escrow WHERE table_id = $1 AND balance > 0', [String(tableId)]);
  return rows.map(r => ({ user_id: r.user_id, balance: Number(r.balance || 0) }));
}

// --- Request throttling ---
export async function getLastRequestAt(guildId, userId) {
  const row = await q1('SELECT last_ts FROM request_last WHERE guild_id = $1 AND user_id = $2', [guildId, userId]);
  return row ? Number(row.last_ts) : 0;
}
export async function setLastRequestNow(guildId, userId, ts = null) {
  const t = ts ? Number(ts) : Math.floor(Date.now() / 1000);
  await q('INSERT INTO request_last (guild_id, user_id, last_ts) VALUES ($1,$2,$3) ON CONFLICT (guild_id,user_id) DO UPDATE SET last_ts = EXCLUDED.last_ts', [guildId, userId, t]);
  return t;
}

// --- API keys ---
export async function lookupApiKey(token) {
  if (!token) return null;
  const row = await q1('SELECT id, token, guild_id, scopes FROM api_keys WHERE token = $1', [token]);
  if (!row) return null;
  const scopes = String(row.scopes || '').split(',').map(s => s.trim()).filter(Boolean);
  return { id: row.id, guildId: row.guild_id, scopes };
}

export async function createApiKey({ token, guildId, scopes }) {
  if (!guildId) throw new Error('GUILD_ID_REQUIRED');
  let newToken = token;
  if (!newToken) {
    const { randomBytes } = await import('node:crypto');
    newToken = randomBytes(24).toString('base64url');
  }
  const scopeStr = Array.isArray(scopes) ? scopes.join(',') : (scopes || '');
  try {
    await q('INSERT INTO api_keys (token, guild_id, scopes) VALUES ($1,$2,$3)', [newToken, guildId, scopeStr]);
  } catch (e) {
    if (String(e?.message || '').includes('duplicate')) throw new Error('TOKEN_EXISTS');
    throw e;
  }
  const row = await q1('SELECT id, token, guild_id, scopes FROM api_keys WHERE token = $1', [newToken]);
  const parsedScopes = String(row.scopes || '').split(',').map(s => s.trim()).filter(Boolean);
  return { id: row.id, token: row.token, guildId: row.guild_id, scopes: parsedScopes };
}

export async function deleteApiKey(token) {
  if (!token) throw new Error('TOKEN_REQUIRED');
  const res = await q('DELETE FROM api_keys WHERE token = $1 RETURNING 1', [token]);
  return { deleted: res.length };
}

export async function listApiKeys(guildId = null) {
  const rows = guildId
    ? await q('SELECT id, token, guild_id, scopes FROM api_keys WHERE guild_id = $1 ORDER BY id DESC', [guildId])
    : await q('SELECT id, token, guild_id, scopes FROM api_keys ORDER BY id DESC');
  return rows.map(r => ({ id: r.id, token: r.token, guildId: r.guild_id, scopes: String(r.scopes || '').split(',').map(s => s.trim()).filter(Boolean) }));
}

// --- Reset balances ---
export async function resetAllBalances(guildId) {
  const gid = resolveGuildId(guildId);
  return tx(async c => {
    const usersBefore = await c.query('SELECT COUNT(*) AS n FROM users WHERE guild_id = $1', [gid]);
    const before = Number(usersBefore.rows[0].n || 0);
    const updated = await c.query('UPDATE users SET chips = 0, credits = 100, updated_at = NOW() WHERE guild_id = $1', [gid]);
    await c.query('UPDATE guild_house SET chips = 0, updated_at = NOW() WHERE guild_id = $1', [gid]);
    return { guildId: gid, usersBefore: before, usersUpdated: updated.rowCount || 0, house: 0 };
  });
}

export const __DB_DRIVER = 'pg';
