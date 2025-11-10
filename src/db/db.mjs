import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import 'dotenv/config';

const db = new Database(process.env.DB_PATH || './casino.db');
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

const DEFAULT_GUILD_ID = process.env.PRIMARY_GUILD_ID || process.env.GUILD_ID || 'global';
const ECONOMY_SCOPE = (process.env.ECONOMY_SCOPE || 'global').toLowerCase();
const ECONOMY_GUILD_ID = process.env.GLOBAL_ECONOMY_ID || DEFAULT_GUILD_ID;
const USE_GLOBAL_ECONOMY = ECONOMY_SCOPE !== 'guild';
const MG_PER_GRAM = 1000;
const CARTEL_DEFAULT_BASE_RATE_GRAMS_PER_HOUR = Math.max(1, Number(process.env.CARTEL_BASE_RATE_GRAMS_PER_HOUR || 180));
const CARTEL_DEFAULT_BASE_RATE_MG_PER_HOUR = Math.round(CARTEL_DEFAULT_BASE_RATE_GRAMS_PER_HOUR * MG_PER_GRAM);
const CARTEL_DEFAULT_SHARE_RATE_GRAMS_PER_HOUR = Math.max(0.001, Number(process.env.CARTEL_SHARE_RATE_GRAMS_PER_HOUR || 0.10));
const CARTEL_DEFAULT_SHARE_RATE_MG_PER_HOUR = Math.round(CARTEL_DEFAULT_SHARE_RATE_GRAMS_PER_HOUR * MG_PER_GRAM);
const CARTEL_DEFAULT_XP_PER_GRAM_SOLD = Math.max(0, Number(process.env.CARTEL_XP_PER_GRAM_SOLD || 2));
const CARTEL_DEFAULT_SHARE_PRICE = Math.max(1, Math.floor(Number(process.env.CARTEL_SHARE_PRICE || 100)));

// --- SCHEMA & MIGRATIONS ---
db.exec(`
-- Legacy: admin_roles has been renamed to mod_roles. Keep migration below.
CREATE TABLE IF NOT EXISTS mod_roles (
  guild_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, role_id)
);
CREATE TABLE IF NOT EXISTS mod_users (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);
CREATE TABLE IF NOT EXISTS admin_users (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);
CREATE TABLE IF NOT EXISTS daily_spin_last (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_ts INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);
CREATE TABLE IF NOT EXISTS users (
  guild_id TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  chips INTEGER NOT NULL DEFAULT 0,
  credits INTEGER NOT NULL DEFAULT 0,
  first_game_win_at INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, discord_id)
);
CREATE TABLE IF NOT EXISTS user_onboarding (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  acknowledged_at INTEGER,
  chips_granted INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, user_id)
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY,
  guild_id TEXT NOT NULL,
  account TEXT NOT NULL,             -- 'HOUSE', 'BURN', a Discord user id
  delta INTEGER NOT NULL,
  reason TEXT,
  admin_id TEXT,
  currency TEXT NOT NULL DEFAULT 'CHIPS', -- 'CHIPS' or 'CREDITS'
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS guild_house (
  guild_id TEXT PRIMARY KEY,
  chips INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id TEXT PRIMARY KEY,
  log_channel_id TEXT,               -- used as GAME log channel
  cash_log_channel_id TEXT,          -- channel for non-game chip/credit transactions
  request_channel_id TEXT,           -- channel where buyin/cashout requests are posted
  update_channel_id TEXT,            -- channel where update announcements are posted
  request_cooldown_sec INTEGER NOT NULL DEFAULT 0,
  logging_enabled INTEGER NOT NULL DEFAULT 0,
  max_ridebus_bet INTEGER NOT NULL DEFAULT 1000,
  holdem_rake_bps INTEGER NOT NULL DEFAULT 0,      -- rake percent in basis points (e.g., 250 = 2.50%)
  holdem_rake_cap INTEGER NOT NULL DEFAULT 0,      -- optional rake cap in chips
  kitten_mode_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  guild_id TEXT NOT NULL,
  scopes TEXT NOT NULL DEFAULT '' -- comma-separated list of scopes
);
CREATE TABLE IF NOT EXISTS vote_rewards (
  id INTEGER PRIMARY KEY,
  discord_user_id TEXT NOT NULL,
  source TEXT NOT NULL,
  reward_amount INTEGER NOT NULL,
  metadata_json TEXT,
  earned_at INTEGER NOT NULL,
  external_id TEXT,
  claimed_at INTEGER,
  claim_guild_id TEXT
);
CREATE TABLE IF NOT EXISTS bot_status_snapshots (
  id TEXT PRIMARY KEY,
  guild_count INTEGER NOT NULL DEFAULT 0,
  player_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS active_requests (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL, -- PENDING | TAKEN
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (guild_id, user_id)
);
-- Hold'em: metadata, hands, escrow, commits
CREATE TABLE IF NOT EXISTS holdem_tables (
  table_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  sb INTEGER NOT NULL,
  bb INTEGER NOT NULL,
  min INTEGER NOT NULL,
  max INTEGER NOT NULL,
  rake_bps INTEGER NOT NULL DEFAULT 0,
  host_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS holdem_hands (
  hand_id INTEGER PRIMARY KEY,
  table_id TEXT NOT NULL,
  hand_no INTEGER NOT NULL,
  board TEXT,
  winners_json TEXT,
  rake_paid INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS holdem_escrow (
  table_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (table_id, user_id)
);
CREATE TABLE IF NOT EXISTS holdem_commits (
  id INTEGER PRIMARY KEY,
  hand_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  street TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS job_profiles (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  rank INTEGER NOT NULL DEFAULT 1,
  total_xp INTEGER NOT NULL DEFAULT 0,
  xp_to_next INTEGER NOT NULL DEFAULT 100,
  last_shift_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (guild_id, user_id, job_id)
);
CREATE TABLE IF NOT EXISTS job_status (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  active_job TEXT NOT NULL DEFAULT 'none',
  job_switch_available_at INTEGER NOT NULL DEFAULT 0,
  cooldown_reason TEXT,
  daily_earning_cap INTEGER,
  earned_today INTEGER NOT NULL DEFAULT 0,
  cap_reset_at INTEGER,
  shift_streak_count INTEGER NOT NULL DEFAULT 0,
  shift_cooldown_expires_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (guild_id, user_id)
);
CREATE TABLE IF NOT EXISTS job_shifts (
  id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  performance_score INTEGER NOT NULL DEFAULT 0,
  base_pay INTEGER NOT NULL DEFAULT 0,
  tip_percent INTEGER NOT NULL DEFAULT 0,
  tip_amount INTEGER NOT NULL DEFAULT 0,
  total_payout INTEGER NOT NULL DEFAULT 0,
  result_state TEXT NOT NULL DEFAULT 'PENDING',
  metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS user_interaction_stats (
  user_id TEXT PRIMARY KEY,
  total_interactions INTEGER NOT NULL DEFAULT 0,
  first_interaction_at INTEGER NOT NULL,
  last_interaction_at INTEGER NOT NULL,
  last_guild_id TEXT,
  last_channel_id TEXT,
  last_type TEXT,
  last_key TEXT,
  last_locale TEXT,
  last_metadata_json TEXT,
  review_prompt_attempted_at INTEGER,
  review_prompt_sent_at INTEGER,
  review_prompt_status TEXT,
  review_prompt_last_error TEXT
);
CREATE TABLE IF NOT EXISTS cartel_pool (
  guild_id TEXT PRIMARY KEY,
  total_shares INTEGER NOT NULL DEFAULT 0,
  base_rate_mg_per_hour INTEGER NOT NULL DEFAULT 180000,
  share_price INTEGER NOT NULL DEFAULT ${CARTEL_DEFAULT_SHARE_PRICE},
  share_rate_mg_per_hour INTEGER NOT NULL DEFAULT ${CARTEL_DEFAULT_SHARE_RATE_MG_PER_HOUR},
  xp_per_gram_sold INTEGER NOT NULL DEFAULT ${CARTEL_DEFAULT_XP_PER_GRAM_SOLD},
  carryover_mg INTEGER NOT NULL DEFAULT 0,
  last_tick_at INTEGER,
  event_state TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE TABLE IF NOT EXISTS cartel_investors (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  shares INTEGER NOT NULL DEFAULT 0,
  stash_mg INTEGER NOT NULL DEFAULT 0,
  warehouse_mg INTEGER NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL DEFAULT 1,
  rank_xp INTEGER NOT NULL DEFAULT 0,
  auto_sell_rule TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (guild_id, user_id),
  CHECK (shares >= 0),
  CHECK (stash_mg >= 0),
  CHECK (warehouse_mg >= 0)
);
CREATE TABLE IF NOT EXISTS cartel_transactions (
  id INTEGER PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT,
  type TEXT NOT NULL,
  amount_chips INTEGER NOT NULL DEFAULT 0,
  amount_mg INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_cartel_investors_guild ON cartel_investors (guild_id);
CREATE INDEX IF NOT EXISTS idx_cartel_transactions_guild_time ON cartel_transactions (guild_id, created_at DESC);
CREATE TABLE IF NOT EXISTS cartel_dealers (
  dealer_id TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tier INTEGER NOT NULL,
  trait TEXT,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  hourly_sell_cap_mg INTEGER NOT NULL,
  price_multiplier_bps INTEGER NOT NULL,
  upkeep_cost INTEGER NOT NULL,
  upkeep_interval_seconds INTEGER NOT NULL DEFAULT 3600,
  upkeep_due_at INTEGER NOT NULL,
  bust_until INTEGER,
  last_sold_at INTEGER,
  lifetime_sold_mg INTEGER NOT NULL DEFAULT 0,
  pending_chips INTEGER NOT NULL DEFAULT 0,
  pending_mg INTEGER NOT NULL DEFAULT 0,
  chip_remainder_units INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_cartel_dealers_guild ON cartel_dealers (guild_id);
CREATE INDEX IF NOT EXISTS idx_cartel_dealers_user ON cartel_dealers (guild_id, user_id);
CREATE TABLE IF NOT EXISTS user_interaction_events (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL,
  interaction_type TEXT,
  interaction_key TEXT,
  guild_id TEXT,
  channel_id TEXT,
  locale TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_news_settings (
  user_id TEXT PRIMARY KEY,
  news_opt_in INTEGER NOT NULL DEFAULT 1,
  last_delivered_at INTEGER,
  last_digest TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_interaction_events_user ON user_interaction_events (user_id, created_at DESC);
`);

// Migration: add credits column if missing
try { db.prepare(`SELECT credits FROM users LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT 0`);
}
// Migration: add first_game_win_at to users if missing
try { db.prepare(`SELECT first_game_win_at FROM users LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE users ADD COLUMN first_game_win_at INTEGER`);
}
// Migration: add currency column if missing
try { db.prepare(`SELECT currency FROM transactions LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE transactions ADD COLUMN currency TEXT NOT NULL DEFAULT 'CHIPS'`);
}
// Migration: add max_ridebus_bet to guild_settings if missing (for existing DBs)
try { db.prepare(`SELECT max_ridebus_bet FROM guild_settings LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE guild_settings ADD COLUMN max_ridebus_bet INTEGER NOT NULL DEFAULT 1000`);
}
// Migration: add cash_log_channel_id to guild_settings if missing
try { db.prepare(`SELECT cash_log_channel_id FROM guild_settings LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE guild_settings ADD COLUMN cash_log_channel_id TEXT`);
}
// Migration: add chip_remainder_units to cartel_dealers if missing
try { db.prepare(`SELECT chip_remainder_units FROM cartel_dealers LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE cartel_dealers ADD COLUMN chip_remainder_units INTEGER NOT NULL DEFAULT 0`);
}
// Migration: add request_channel_id to guild_settings if missing
try { db.prepare(`SELECT request_channel_id FROM guild_settings LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE guild_settings ADD COLUMN request_channel_id TEXT`);
}
// Migration: add update_channel_id to guild_settings if missing
try { db.prepare(`SELECT update_channel_id FROM guild_settings LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE guild_settings ADD COLUMN update_channel_id TEXT`);
}
// Migration: add request_cooldown_sec to guild_settings if missing
try { db.prepare(`SELECT request_cooldown_sec FROM guild_settings LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE guild_settings ADD COLUMN request_cooldown_sec INTEGER NOT NULL DEFAULT 0`);
}
// Migration: add display_name to cartel_dealers if missing
try { db.prepare(`SELECT display_name FROM cartel_dealers LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE cartel_dealers ADD COLUMN display_name TEXT`);
}

// Migration: add share_price to cartel_pool if missing
try { db.prepare(`SELECT share_price FROM cartel_pool LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE cartel_pool ADD COLUMN share_price INTEGER NOT NULL DEFAULT ${CARTEL_DEFAULT_SHARE_PRICE}`);
}

// Migration: add share_rate_mg_per_hour to cartel_pool if missing
try { db.prepare(`SELECT share_rate_mg_per_hour FROM cartel_pool LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE cartel_pool ADD COLUMN share_rate_mg_per_hour INTEGER NOT NULL DEFAULT ${CARTEL_DEFAULT_SHARE_RATE_MG_PER_HOUR}`);
}

// Migration: add xp_per_gram_sold to cartel_pool if missing
try { db.prepare(`SELECT xp_per_gram_sold FROM cartel_pool LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE cartel_pool ADD COLUMN xp_per_gram_sold INTEGER NOT NULL DEFAULT ${CARTEL_DEFAULT_XP_PER_GRAM_SOLD}`);
}

// Migration: add pending columns to cartel_dealers if missing
try { db.prepare(`SELECT pending_chips FROM cartel_dealers LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE cartel_dealers ADD COLUMN pending_chips INTEGER NOT NULL DEFAULT 0`);
}
try { db.prepare(`SELECT pending_mg FROM cartel_dealers LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE cartel_dealers ADD COLUMN pending_mg INTEGER NOT NULL DEFAULT 0`);
}
// Migration: add casino_category_id to guild_settings if missing
try { db.prepare(`SELECT casino_category_id FROM guild_settings LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE guild_settings ADD COLUMN casino_category_id TEXT`);
}
// Migration: add holdem_rake_bps to guild_settings if missing
try { db.prepare(`SELECT holdem_rake_bps FROM guild_settings LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE guild_settings ADD COLUMN holdem_rake_bps INTEGER NOT NULL DEFAULT 0`);
}
// Migration: add holdem_rake_cap to guild_settings if missing
try { db.prepare(`SELECT holdem_rake_cap FROM guild_settings LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE guild_settings ADD COLUMN holdem_rake_cap INTEGER NOT NULL DEFAULT 0`);
}
// Migration: add kitten_mode_enabled to guild_settings if missing
try { db.prepare(`SELECT kitten_mode_enabled FROM guild_settings LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE guild_settings ADD COLUMN kitten_mode_enabled INTEGER NOT NULL DEFAULT 0`);
}
try { db.prepare(`SELECT external_id FROM vote_rewards LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE vote_rewards ADD COLUMN external_id TEXT`);
}


function migrateUsersToGuildScoped() {
  const info = db.prepare("PRAGMA table_info(users)").all();
  if (!info.length) return;
  const hasGuildId = info.some(r => r.name === 'guild_id');
  const hasLegacyId = info.some(r => r.name === 'id');
  const pkOrder = info.filter(r => r.pk > 0).map(r => r.name).sort().join(',');
  const hasCompositePk = pkOrder === 'discord_id,guild_id';
  if (hasGuildId && !hasLegacyId && hasCompositePk) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS users_tmp (
      guild_id TEXT NOT NULL,
      discord_id TEXT NOT NULL,
      chips INTEGER NOT NULL DEFAULT 0,
      credits INTEGER NOT NULL DEFAULT 0,
      first_game_win_at INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (guild_id, discord_id)
    );
  `);
  const insertLegacy = db.prepare(`
    INSERT INTO users_tmp (guild_id, discord_id, chips, credits, first_game_win_at, created_at, updated_at)
    SELECT @guild, discord_id, chips, credits, NULL, created_at, updated_at FROM users
  `);
  const migrate = db.transaction(() => {
    insertLegacy.run({ guild: ECONOMY_GUILD_ID });
    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_tmp RENAME TO users');
  });
  migrate();
}

function migrateTransactionsToGuildScoped() {
  try { db.prepare('SELECT guild_id FROM transactions LIMIT 1').get(); return; } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions_tmp (
      id INTEGER PRIMARY KEY,
      guild_id TEXT NOT NULL,
      account TEXT NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT,
      admin_id TEXT,
      currency TEXT NOT NULL DEFAULT 'CHIPS',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const insertLegacy = db.prepare(`
    INSERT INTO transactions_tmp (id, guild_id, account, delta, reason, admin_id, currency, created_at)
    SELECT id, @guild, account, delta, reason, admin_id, currency, created_at FROM transactions
  `);
  const migrate = db.transaction(() => {
    insertLegacy.run({ guild: ECONOMY_GUILD_ID });
    db.exec('DROP TABLE transactions');
    db.exec('ALTER TABLE transactions_tmp RENAME TO transactions');
  });
  migrate();
}

function seedGuildHouseFromLegacy() {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM guild_house').get()?.n || 0;
  if (existing > 0) return;
  let legacy = 0;
  try {
    const row = db.prepare('SELECT chips FROM house WHERE id = 1').get();
    if (row && Number.isFinite(row.chips)) legacy = row.chips;
  } catch {}
  db.prepare('INSERT OR IGNORE INTO guild_house (guild_id, chips) VALUES (?, ?)').run(ECONOMY_GUILD_ID, legacy);
}

function mergeEconomyToGlobalScope() {
  if (!USE_GLOBAL_ECONOMY) return;
  const gid = ECONOMY_GUILD_ID;

  const needsUserMerge = db.prepare('SELECT 1 FROM users WHERE guild_id != ? LIMIT 1').get(gid);
  if (needsUserMerge) {
    const aggregated = db.prepare(`
      SELECT discord_id,
             COALESCE(SUM(chips), 0) AS chips,
             COALESCE(SUM(credits), 0) AS credits,
             MIN(first_game_win_at) AS first_game_win_at,
             MIN(created_at) AS created_at,
             MAX(updated_at) AS updated_at
      FROM users
      GROUP BY discord_id
    `).all();
    const deleteUsersStmt = db.prepare('DELETE FROM users');
    const insertUserStmt = db.prepare('INSERT INTO users (guild_id, discord_id, chips, credits, first_game_win_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const mergeUsers = db.transaction(() => {
      deleteUsersStmt.run();
      for (const row of aggregated) {
        const chips = Number(row?.chips || 0);
        const credits = Number(row?.credits || 0);
        const firstGameWinAt = row?.first_game_win_at != null ? Number(row.first_game_win_at) : null;
        const createdAt = row?.created_at || new Date().toISOString();
        const updatedAt = row?.updated_at || createdAt;
        insertUserStmt.run(gid, row.discord_id, chips, credits, firstGameWinAt != null ? Math.trunc(firstGameWinAt) : null, String(createdAt), String(updatedAt));
      }
    });
    mergeUsers();
  } else {
    db.prepare('UPDATE users SET guild_id = ? WHERE guild_id != ?').run(gid, gid);
  }

  db.prepare('UPDATE transactions SET guild_id = ? WHERE guild_id != ?').run(gid, gid);

  const needsHouseMerge = db.prepare('SELECT 1 FROM guild_house WHERE guild_id != ? LIMIT 1').get(gid);
  if (needsHouseMerge) {
    const totalRow = db.prepare('SELECT COALESCE(SUM(chips), 0) AS total FROM guild_house').get();
    const total = Number(totalRow?.total || 0);
    const mergeHouse = db.transaction(() => {
      db.prepare('DELETE FROM guild_house').run();
      db.prepare('INSERT INTO guild_house (guild_id, chips) VALUES (?, ?)').run(gid, total);
    });
    mergeHouse();
  }
}

migrateUsersToGuildScoped();
migrateTransactionsToGuildScoped();
seedGuildHouseFromLegacy();
mergeEconomyToGlobalScope();
db.prepare('INSERT OR IGNORE INTO guild_house (guild_id, chips) VALUES (?, 0)').run(ECONOMY_GUILD_ID);
db.exec('CREATE INDEX IF NOT EXISTS idx_users_guild_discord ON users (guild_id, discord_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_transactions_guild_created ON transactions (guild_id, created_at)');
db.exec('CREATE INDEX IF NOT EXISTS idx_vote_rewards_user_claimed ON vote_rewards (discord_user_id, claimed_at)');
db.exec('CREATE INDEX IF NOT EXISTS idx_job_profiles_user ON job_profiles (guild_id, user_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_job_profiles_job ON job_profiles (job_id, guild_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_job_shifts_user_started ON job_shifts (guild_id, user_id, started_at)');
db.exec('CREATE INDEX IF NOT EXISTS idx_job_status_guild_switch ON job_status (guild_id, job_switch_available_at)');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_vote_rewards_source_external ON vote_rewards (source, external_id)');
db.exec('CREATE INDEX IF NOT EXISTS idx_user_onboarding_ack ON user_onboarding (guild_id, acknowledged_at)');


// --- PREPARED STATEMENTS ---
// --- MIGRATION: move admin_roles -> mod_roles (idempotent) ---
try {
  const hasOld = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='admin_roles'").get();
  if (hasOld) {
    db.exec('INSERT OR IGNORE INTO mod_roles (guild_id, role_id) SELECT guild_id, role_id FROM admin_roles');
    db.exec('DROP TABLE IF EXISTS admin_roles');
  }
} catch {}

const getAllModUsersStmt = db.prepare('SELECT DISTINCT user_id FROM mod_users');
const insertModUserStmt = db.prepare('INSERT OR IGNORE INTO mod_users (guild_id, user_id) VALUES (?, ?)');

const getAllAdminUsersStmt = db.prepare('SELECT DISTINCT user_id FROM admin_users');
const insertAdminUserStmt = db.prepare('INSERT OR IGNORE INTO admin_users (guild_id, user_id) VALUES (?, ?)');
const getDailySpinStmt = db.prepare('SELECT last_ts FROM daily_spin_last WHERE guild_id = ? AND user_id = ?');
const upsertDailySpinStmt = db.prepare(`
  INSERT INTO daily_spin_last (guild_id, user_id, last_ts)
  VALUES (?, ?, ?)
  ON CONFLICT(guild_id, user_id) DO UPDATE SET last_ts = excluded.last_ts
`);

const ensureUserStmt = db.prepare('INSERT OR IGNORE INTO users (guild_id, discord_id) VALUES (?, ?)');
const getUserStmt = db.prepare('SELECT chips, credits, first_game_win_at FROM users WHERE guild_id = ? AND discord_id = ?');
const setFirstGameWinStmt = db.prepare(`
  UPDATE users
  SET first_game_win_at = COALESCE(first_game_win_at, ?),
      updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = ? AND discord_id = ?
    AND first_game_win_at IS NULL
`);
const findUserGuildStmt = db.prepare('SELECT guild_id FROM users WHERE discord_id = ? ORDER BY updated_at DESC LIMIT 1');
const addChipsStmt = db.prepare('UPDATE users SET chips = chips + ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND discord_id = ?');
const addCreditsStmt = db.prepare('UPDATE users SET credits = credits + ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND discord_id = ?');
const getUserOnboardingStmt = db.prepare('SELECT acknowledged_at, chips_granted FROM user_onboarding WHERE guild_id = ? AND user_id = ?');
const ensureUserOnboardingStmt = db.prepare('INSERT OR IGNORE INTO user_onboarding (guild_id, user_id) VALUES (?, ?)');
const updateUserOnboardingGrantStmt = db.prepare('UPDATE user_onboarding SET chips_granted = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?');
const acknowledgeUserOnboardingStmt = db.prepare('UPDATE user_onboarding SET acknowledged_at = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ? AND acknowledged_at IS NULL');
const getUserNewsSettingsStmt = db.prepare('SELECT news_opt_in, last_delivered_at, last_digest FROM user_news_settings WHERE user_id = ?');
const setUserNewsOptInStmt = db.prepare(`
  INSERT INTO user_news_settings (user_id, news_opt_in, updated_at)
  VALUES (?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(user_id) DO UPDATE SET news_opt_in = excluded.news_opt_in, updated_at = CURRENT_TIMESTAMP
`);
const recordUserNewsDeliveryStmt = db.prepare(`
  INSERT INTO user_news_settings (user_id, news_opt_in, last_delivered_at, last_digest, updated_at)
  VALUES (?, 1, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(user_id) DO UPDATE SET
    last_delivered_at = excluded.last_delivered_at,
    last_digest = excluded.last_digest,
    updated_at = CURRENT_TIMESTAMP
`);

const ensureHouseStmt = db.prepare('INSERT OR IGNORE INTO guild_house (guild_id) VALUES (?)');
const getHouseStmt = db.prepare('SELECT chips FROM guild_house WHERE guild_id = ?');
const updateHouseStmt = db.prepare('UPDATE guild_house SET chips = chips + ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?');
const sumUserChipsStmt = db.prepare('SELECT COALESCE(SUM(chips), 0) AS total FROM users WHERE guild_id = ?');

const insertTxnStmt = db.prepare('INSERT INTO transactions (guild_id, account, delta, reason, admin_id, currency) VALUES (?, ?, ?, ?, ?, ?)');

const insertVoteRewardStmt = db.prepare(`
  INSERT INTO vote_rewards (discord_user_id, source, reward_amount, metadata_json, earned_at, external_id)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const pendingVoteRewardsStmt = db.prepare(`
  SELECT id, source, reward_amount, metadata_json, earned_at
  FROM vote_rewards
  WHERE discord_user_id = ? AND claimed_at IS NULL
  ORDER BY earned_at ASC, id ASC
`);
const markVoteRewardClaimedStmt = db.prepare(`
  UPDATE vote_rewards
  SET claimed_at = ?, claim_guild_id = ?
  WHERE id = ?
`);
const ensureCartelPoolStmt = db.prepare(`
  INSERT INTO cartel_pool (guild_id, base_rate_mg_per_hour, share_price, share_rate_mg_per_hour, xp_per_gram_sold)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(guild_id) DO NOTHING
`);
const getCartelPoolStmt = db.prepare(`
  SELECT guild_id, total_shares, base_rate_mg_per_hour, share_price, share_rate_mg_per_hour, xp_per_gram_sold, carryover_mg, last_tick_at, event_state
  FROM cartel_pool
  WHERE guild_id = ?
`);
const updateCartelPoolSharesStmt = db.prepare(`
  UPDATE cartel_pool
  SET total_shares = total_shares + ?, updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = ?
`);
const setCartelPoolTickStmt = db.prepare(`
  UPDATE cartel_pool
  SET last_tick_at = ?, carryover_mg = ?, updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = ?
`);
const setCartelSharePriceStmt = db.prepare(`
  UPDATE cartel_pool
  SET share_price = ?, updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = ?
`);
const setCartelShareRateStmt = db.prepare(`
  UPDATE cartel_pool
  SET share_rate_mg_per_hour = ?, updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = ?
`);
const setCartelXpPerGramStmt = db.prepare(`
  UPDATE cartel_pool
  SET xp_per_gram_sold = ?, updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = ?
`);
const listCartelGuildIdsStmt = db.prepare(`
  SELECT guild_id FROM (
    SELECT DISTINCT guild_id FROM cartel_pool
    UNION
    SELECT DISTINCT guild_id FROM cartel_investors
    UNION
    SELECT DISTINCT guild_id FROM cartel_dealers
  )
`);
const ensureCartelInvestorStmt = db.prepare(`
  INSERT INTO cartel_investors (guild_id, user_id)
  VALUES (?, ?)
  ON CONFLICT(guild_id, user_id) DO NOTHING
`);
const getCartelInvestorStmt = db.prepare(`
  SELECT guild_id, user_id, shares, stash_mg, warehouse_mg, rank, rank_xp, auto_sell_rule, created_at, updated_at
  FROM cartel_investors
  WHERE guild_id = ? AND user_id = ?
`);
const listCartelInvestorsStmt = db.prepare(`
  SELECT guild_id, user_id, shares, stash_mg, warehouse_mg, rank, rank_xp, auto_sell_rule, created_at, updated_at
  FROM cartel_investors
  WHERE guild_id = ?
`);
const addCartelInvestorSharesStmt = db.prepare(`
  UPDATE cartel_investors
  SET shares = shares + ?, updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = ? AND user_id = ?
`);
const setCartelInvestorStateStmt = db.prepare(`
  UPDATE cartel_investors
  SET stash_mg = ?, warehouse_mg = ?, rank = ?, rank_xp = ?, updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = ? AND user_id = ?
`);
const setCartelInvestorHoldingsStmt = db.prepare(`
  UPDATE cartel_investors
  SET stash_mg = ?, warehouse_mg = ?, updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = ? AND user_id = ?
`);
const setCartelInvestorRankStmt = db.prepare(`
  UPDATE cartel_investors
  SET rank = ?, rank_xp = ?, updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = ? AND user_id = ?
`);
const setCartelInvestorAutoRuleStmt = db.prepare(`
  UPDATE cartel_investors
  SET auto_sell_rule = ?, updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = ? AND user_id = ?
`);
const resetCartelInvestorStmt = db.prepare(`
  UPDATE cartel_investors
  SET shares = 0,
      stash_mg = 0,
      warehouse_mg = 0,
      rank = 1,
      rank_xp = 0,
      auto_sell_rule = NULL,
      updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = ? AND user_id = ?
`);
const recordCartelTxnStmt = db.prepare(`
  INSERT INTO cartel_transactions (guild_id, user_id, type, amount_chips, amount_mg, metadata_json)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const clearCartelDealerPendingTx = db.transaction((guildId, entries = []) => {
  for (const entry of entries) {
    const chips = Math.max(0, Math.floor(Number(entry.pending_chips || entry.chips || 0)));
    const mg = Math.max(0, Math.floor(Number(entry.pending_mg || entry.mg || 0)));
    if (!chips && !mg) continue;
    clearCartelDealerPendingStmt.run(chips, mg, guildId, entry.dealer_id);
  }
});
const insertCartelDealerStmt = db.prepare(`
  INSERT INTO cartel_dealers (dealer_id, guild_id, user_id, tier, trait, display_name, status, hourly_sell_cap_mg, price_multiplier_bps, upkeep_cost, upkeep_interval_seconds, upkeep_due_at, bust_until, last_sold_at, lifetime_sold_mg, pending_chips, pending_mg, chip_remainder_units)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)
`);
const deleteCartelDealerStmt = db.prepare(`
  DELETE FROM cartel_dealers
  WHERE guild_id = ? AND dealer_id = ?
`);
const deleteCartelDealersForUserStmt = db.prepare(`
  DELETE FROM cartel_dealers
  WHERE guild_id = ? AND user_id = ?
`);
const listCartelDealersStmt = db.prepare(`
  SELECT dealer_id, guild_id, user_id, tier, trait, display_name, status, hourly_sell_cap_mg, price_multiplier_bps, upkeep_cost, upkeep_interval_seconds, upkeep_due_at, bust_until, last_sold_at, lifetime_sold_mg, pending_chips, pending_mg, chip_remainder_units, created_at, updated_at
  FROM cartel_dealers
  WHERE guild_id = ?
`);
const listCartelDealersForUserStmt = db.prepare(`
  SELECT dealer_id, guild_id, user_id, tier, trait, display_name, status, hourly_sell_cap_mg, price_multiplier_bps, upkeep_cost, upkeep_interval_seconds, upkeep_due_at, bust_until, last_sold_at, lifetime_sold_mg, pending_chips, pending_mg, chip_remainder_units, created_at, updated_at
  FROM cartel_dealers
  WHERE guild_id = ? AND user_id = ?
  ORDER BY created_at ASC
`);
const getCartelDealerStmt = db.prepare(`
  SELECT dealer_id, guild_id, user_id, tier, trait, display_name, status, hourly_sell_cap_mg, price_multiplier_bps, upkeep_cost, upkeep_interval_seconds, upkeep_due_at, bust_until, last_sold_at, lifetime_sold_mg, pending_chips, pending_mg, chip_remainder_units, created_at, updated_at
  FROM cartel_dealers
  WHERE guild_id = ? AND dealer_id = ?
`);
const updateCartelDealerStatusStmt = db.prepare(`
  UPDATE cartel_dealers
  SET status = ?, updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = ? AND dealer_id = ?
`);
const updateCartelDealerUpkeepStmt = db.prepare(`
  UPDATE cartel_dealers
  SET upkeep_due_at = ?, status = ?, updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = ? AND dealer_id = ?
`);
const updateCartelDealerSaleStmt = db.prepare(`
  UPDATE cartel_dealers
  SET last_sold_at = ?, lifetime_sold_mg = lifetime_sold_mg + ?, chip_remainder_units = COALESCE(?, chip_remainder_units), updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = ? AND dealer_id = ?
`);
const addCartelDealerPendingStmt = db.prepare(`
  UPDATE cartel_dealers
  SET pending_chips = pending_chips + ?, pending_mg = pending_mg + ?, updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = ? AND dealer_id = ?
`);
const clearCartelDealerPendingStmt = db.prepare(`
  UPDATE cartel_dealers
  SET pending_chips = MAX(0, pending_chips - ?),
      pending_mg = MAX(0, pending_mg - ?),
      updated_at = CURRENT_TIMESTAMP
  WHERE guild_id = ? AND dealer_id = ?
`);
const listPendingVoteUsersStmt = db.prepare(`
  SELECT discord_user_id
  FROM vote_rewards
  WHERE claimed_at IS NULL
  GROUP BY discord_user_id
  ORDER BY MIN(earned_at) ASC, MIN(id) ASC
  LIMIT ?
`);

const topUsersStmt = db.prepare(`
  SELECT discord_id, chips
  FROM users
  WHERE guild_id = ?
    AND chips > 0
    AND discord_id NOT IN (SELECT user_id FROM admin_users)
    AND discord_id NOT IN (SELECT user_id FROM mod_users)
  ORDER BY chips DESC, created_at ASC
  LIMIT ?
`);

const countUsersStmt = db.prepare('SELECT COUNT(*) AS n FROM users WHERE guild_id = ?');
const countDistinctUsersStmt = db.prepare('SELECT COUNT(DISTINCT discord_id) AS n FROM users');
const listAllUserIdsStmt = db.prepare('SELECT DISTINCT discord_id FROM users ORDER BY discord_id ASC');
const resetUsersStmt = db.prepare('UPDATE users SET chips = 0, credits = 100, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?');
const resetHouseExactStmt = db.prepare('UPDATE guild_house SET chips = 0, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ?');
const upsertBotStatusSnapshotStmt = db.prepare(`
  INSERT INTO bot_status_snapshots (id, guild_count, player_count, updated_at)
  VALUES (?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(id) DO UPDATE SET
    guild_count = excluded.guild_count,
    player_count = excluded.player_count,
    updated_at = CURRENT_TIMESTAMP
`);
const getBotStatusSnapshotStmt = db.prepare('SELECT guild_count, player_count, updated_at FROM bot_status_snapshots WHERE id = ?');

function resolveGuildId(guildId) {
  if (USE_GLOBAL_ECONOMY) return ECONOMY_GUILD_ID;
  return guildId || DEFAULT_GUILD_ID;
}

function ensureGuildUser(guildId, userId) {
  ensureUserStmt.run(guildId, userId);
}

function ensureGuildHouse(guildId) {
  ensureHouseStmt.run(guildId);
}

function ensureCartelPool(guildId) {
  ensureCartelPoolStmt.run(
    guildId,
    CARTEL_DEFAULT_BASE_RATE_MG_PER_HOUR,
    CARTEL_DEFAULT_SHARE_PRICE,
    CARTEL_DEFAULT_SHARE_RATE_MG_PER_HOUR,
    CARTEL_DEFAULT_XP_PER_GRAM_SOLD
  );
}

function ensureCartelInvestor(guildId, userId) {
  ensureCartelPool(guildId);
  ensureCartelInvestorStmt.run(guildId, userId);
}

function houseRow(guildId) {
  ensureGuildHouse(guildId);
  return getHouseStmt.get(guildId) || { chips: 0 };
}

function safeParseJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

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

function normalizeCartelPool(row) {
  if (!row) return null;
  return {
    guild_id: row.guild_id,
    total_shares: Number(row.total_shares || 0),
    base_rate_mg_per_hour: Number(row.base_rate_mg_per_hour || CARTEL_DEFAULT_BASE_RATE_MG_PER_HOUR),
    share_price: Number(row.share_price || CARTEL_DEFAULT_SHARE_PRICE),
    share_rate_mg_per_hour: Number(row.share_rate_mg_per_hour || CARTEL_DEFAULT_SHARE_RATE_MG_PER_HOUR),
    xp_per_gram_sold: Number(row.xp_per_gram_sold || CARTEL_DEFAULT_XP_PER_GRAM_SOLD),
    carryover_mg: Number(row.carryover_mg || 0),
    last_tick_at: row.last_tick_at !== null && row.last_tick_at !== undefined ? Number(row.last_tick_at) : null,
    event_state: safeParseJson(row.event_state) ?? null
  };
}

function normalizeCartelInvestor(row) {
  if (!row) return null;
  return {
    guild_id: row.guild_id,
    user_id: row.user_id,
    shares: Number(row.shares || 0),
    stash_mg: Number(row.stash_mg || 0),
    warehouse_mg: Number(row.warehouse_mg || 0),
    rank: Math.max(1, Number(row.rank || 1)),
    rank_xp: Math.max(0, Number(row.rank_xp || 0)),
    auto_sell_rule: safeParseJson(row.auto_sell_rule) ?? null,
    created_at: row.created_at !== null && row.created_at !== undefined ? Number(row.created_at) : null,
    updated_at: row.updated_at !== null && row.updated_at !== undefined ? Number(row.updated_at) : null
  };
}

function normalizeCartelDealer(row) {
  if (!row) return null;
  return {
    dealer_id: row.dealer_id,
    guild_id: row.guild_id,
    user_id: row.user_id,
    tier: Number(row.tier ?? 1),
    trait: row.trait || null,
    display_name: row.display_name || null,
    status: row.status || 'ACTIVE',
    hourly_sell_cap_mg: Number(row.hourly_sell_cap_mg || 0),
    price_multiplier_bps: Number(row.price_multiplier_bps || 10000),
    upkeep_cost: Number(row.upkeep_cost || 0),
    upkeep_interval_seconds: Number(row.upkeep_interval_seconds || 3600),
    upkeep_due_at: row.upkeep_due_at !== null && row.upkeep_due_at !== undefined ? Number(row.upkeep_due_at) : null,
    bust_until: row.bust_until !== null && row.bust_until !== undefined ? Number(row.bust_until) : null,
    last_sold_at: row.last_sold_at !== null && row.last_sold_at !== undefined ? Number(row.last_sold_at) : null,
    lifetime_sold_mg: Number(row.lifetime_sold_mg || 0),
    pending_chips: Number(row.pending_chips || 0),
    pending_mg: Number(row.pending_mg || 0),
    chip_remainder_units: Number(row.chip_remainder_units || 0),
    created_at: row.created_at !== null && row.created_at !== undefined ? Number(row.created_at) : null,
    updated_at: row.updated_at !== null && row.updated_at !== undefined ? Number(row.updated_at) : null
  };
}

const recordUserInteractionTx = db.transaction(details => {
  const now = Math.floor(Date.now() / 1000);
  const meta = details?.metadata;
  const payload = {
    user_id: String(details.userId),
    interaction_type: details.interactionType || null,
    interaction_key: details.interactionKey || null,
    guild_id: details.guildId ? String(details.guildId) : null,
    channel_id: details.channelId ? String(details.channelId) : null,
    locale: details.locale || null,
    metadata_json: meta == null ? null : (typeof meta === 'string' ? meta : JSON.stringify(meta)),
    created_at: now,
    now
  };
  insertInteractionEventStmt.run(payload);
  upsertInteractionStatStmt.run(payload);
  return normalizeInteractionStats(getInteractionStatStmt.get(payload.user_id));
});

export function recordUserInteraction(details = {}) {
  if (!details || !details.userId) return null;
  return recordUserInteractionTx(details);
}

export function getUserInteractionStats(userId) {
  if (!userId) return null;
  return normalizeInteractionStats(getInteractionStatStmt.get(String(userId)));
}

export function markUserInteractionReviewPrompt(userId, { status = 'sent', error = null, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  if (!userId) return null;
  const ts = Number.isFinite(timestamp) ? Math.floor(timestamp) : Math.floor(Date.now() / 1000);
  markInteractionReviewPromptStmt.run({
    user_id: String(userId),
    ts,
    status: status || null,
    error: error || null
  });
  return getUserInteractionStats(userId);
}

const getGuildSettingsStmt = db.prepare('SELECT log_channel_id, cash_log_channel_id, request_channel_id, update_channel_id, request_cooldown_sec, logging_enabled, max_ridebus_bet, casino_category_id, holdem_rake_bps, holdem_rake_cap, kitten_mode_enabled FROM guild_settings WHERE guild_id = ?');
const ensureGuildSettingsStmt = db.prepare('INSERT OR IGNORE INTO guild_settings (guild_id) VALUES (?)');
const upsertGuildSettingsStmt = db.prepare(`
  INSERT INTO guild_settings (guild_id, log_channel_id, cash_log_channel_id, request_channel_id, update_channel_id, request_cooldown_sec, logging_enabled, max_ridebus_bet, casino_category_id, holdem_rake_bps, holdem_rake_cap, kitten_mode_enabled, updated_at)
  VALUES (
    @guild_id,
    @log_channel_id,
    @cash_log_channel_id,
    @request_channel_id,
    @update_channel_id,
    COALESCE(@request_cooldown_sec, 0),
    COALESCE(@logging_enabled, 0),
    COALESCE(@max_ridebus_bet, 1000),
    @casino_category_id,
    COALESCE(@holdem_rake_bps, 0),
    COALESCE(@holdem_rake_cap, 0),
    COALESCE(@kitten_mode_enabled, 0),
    CURRENT_TIMESTAMP
  )
  ON CONFLICT(guild_id) DO UPDATE SET
    log_channel_id = COALESCE(excluded.log_channel_id, guild_settings.log_channel_id),
    cash_log_channel_id = COALESCE(excluded.cash_log_channel_id, guild_settings.cash_log_channel_id),
    request_channel_id = COALESCE(excluded.request_channel_id, guild_settings.request_channel_id),
    update_channel_id = COALESCE(excluded.update_channel_id, guild_settings.update_channel_id),
    request_cooldown_sec = COALESCE(excluded.request_cooldown_sec, guild_settings.request_cooldown_sec),
    logging_enabled = COALESCE(excluded.logging_enabled, guild_settings.logging_enabled),
    max_ridebus_bet = COALESCE(excluded.max_ridebus_bet, guild_settings.max_ridebus_bet),
    casino_category_id = COALESCE(excluded.casino_category_id, guild_settings.casino_category_id),
    holdem_rake_bps = COALESCE(excluded.holdem_rake_bps, guild_settings.holdem_rake_bps),
    holdem_rake_cap = COALESCE(excluded.holdem_rake_cap, guild_settings.holdem_rake_cap),
    kitten_mode_enabled = COALESCE(excluded.kitten_mode_enabled, guild_settings.kitten_mode_enabled),
    updated_at = CURRENT_TIMESTAMP
`);

// API keys
const getApiKeyStmt = db.prepare('SELECT id, guild_id, scopes FROM api_keys WHERE token = ?');
const insertApiKeyStmt = db.prepare('INSERT INTO api_keys (token, guild_id, scopes) VALUES (?, ?, ?)');
const deleteApiKeyStmt = db.prepare('DELETE FROM api_keys WHERE token = ?');
const listApiKeysStmt = db.prepare('SELECT id, token, guild_id, scopes FROM api_keys ORDER BY id DESC');

// User interaction logging
const insertInteractionEventStmt = db.prepare(`
  INSERT INTO user_interaction_events (
    user_id,
    interaction_type,
    interaction_key,
    guild_id,
    channel_id,
    locale,
    metadata_json,
    created_at
  ) VALUES (@user_id, @interaction_type, @interaction_key, @guild_id, @channel_id, @locale, @metadata_json, @created_at)
`);
const upsertInteractionStatStmt = db.prepare(`
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
  ) VALUES (@user_id, 1, @now, @now, @guild_id, @channel_id, @interaction_type, @interaction_key, @locale, @metadata_json)
  ON CONFLICT(user_id) DO UPDATE SET
    total_interactions = user_interaction_stats.total_interactions + 1,
    last_interaction_at = excluded.last_interaction_at,
    last_guild_id = COALESCE(excluded.last_guild_id, user_interaction_stats.last_guild_id),
    last_channel_id = COALESCE(excluded.last_channel_id, user_interaction_stats.last_channel_id),
    last_type = excluded.last_type,
    last_key = excluded.last_key,
    last_locale = COALESCE(excluded.last_locale, user_interaction_stats.last_locale),
    last_metadata_json = excluded.last_metadata_json
`);
const getInteractionStatStmt = db.prepare('SELECT * FROM user_interaction_stats WHERE user_id = ?');
const markInteractionReviewPromptStmt = db.prepare(`
  UPDATE user_interaction_stats
  SET review_prompt_attempted_at = @ts,
      review_prompt_status = @status,
      review_prompt_sent_at = CASE WHEN @status = 'sent' THEN @ts ELSE review_prompt_sent_at END,
      review_prompt_last_error = @error
  WHERE user_id = @user_id
`);

// Active requests
const getActiveReqStmt = db.prepare('SELECT guild_id, user_id, message_id, type, amount, status FROM active_requests WHERE guild_id = ? AND user_id = ?');
const insertActiveReqStmt = db.prepare(`
  INSERT INTO active_requests (guild_id, user_id, message_id, type, amount, status)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const updateActiveReqStatusStmt = db.prepare(`
  UPDATE active_requests SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE guild_id = ? AND user_id = ?
`);
const clearActiveReqStmt = db.prepare('DELETE FROM active_requests WHERE guild_id = ? AND user_id = ?');

const deleteUsersAllStmt = db.prepare('DELETE FROM users WHERE discord_id = ?');
const deleteTransactionsByAccountStmt = db.prepare('DELETE FROM transactions WHERE account = ?');
const clearTransactionsAdminStmt = db.prepare('UPDATE transactions SET admin_id = NULL WHERE admin_id = ?');
const deleteDailySpinEntriesStmt = db.prepare('DELETE FROM daily_spin_last WHERE user_id = ?');
const deleteRequestLastEntriesStmt = db.prepare('DELETE FROM request_last WHERE user_id = ?');
const deleteVoteRewardsStmt = db.prepare('DELETE FROM vote_rewards WHERE discord_user_id = ?');
const deleteJobProfilesStmt = db.prepare('DELETE FROM job_profiles WHERE user_id = ?');
const deleteJobStatusStmt = db.prepare('DELETE FROM job_status WHERE user_id = ?');
const deleteJobShiftsStmt = db.prepare('DELETE FROM job_shifts WHERE user_id = ?');
const deleteActiveReqAllStmt = db.prepare('DELETE FROM active_requests WHERE user_id = ?');
const deleteHoldemEscrowStmt = db.prepare('DELETE FROM holdem_escrow WHERE user_id = ?');
const deleteHoldemCommitsStmt = db.prepare('DELETE FROM holdem_commits WHERE user_id = ?');
const clearHoldemHostStmt = db.prepare('UPDATE holdem_tables SET host_id = NULL WHERE host_id = ?');
const deleteModUserAllStmt = db.prepare('DELETE FROM mod_users WHERE user_id = ?');
const deleteAdminUserAllStmt = db.prepare('DELETE FROM admin_users WHERE user_id = ?');
const deleteUserOnboardingStmt = db.prepare('DELETE FROM user_onboarding WHERE user_id = ?');

try { db.prepare(`SELECT shift_streak_count FROM job_status LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE job_status ADD COLUMN shift_streak_count INTEGER NOT NULL DEFAULT 0`);
}
try { db.prepare(`SELECT shift_cooldown_expires_at FROM job_status LIMIT 1`).get(); } catch {
  db.exec(`ALTER TABLE job_status ADD COLUMN shift_cooldown_expires_at INTEGER NOT NULL DEFAULT 0`);
}

const ensureJobProfileStmt = db.prepare(`
  INSERT OR IGNORE INTO job_profiles (guild_id, user_id, job_id, rank, total_xp, xp_to_next, last_shift_at, created_at, updated_at)
  VALUES (?, ?, ?, 1, 0, 100, NULL, strftime('%s','now'), strftime('%s','now'))
`);
const selectJobProfileStmt = db.prepare(`
  SELECT guild_id, user_id, job_id, rank, total_xp, xp_to_next, last_shift_at, created_at, updated_at
  FROM job_profiles
  WHERE guild_id = ? AND user_id = ? AND job_id = ?
`);
const selectJobProfilesForUserStmt = db.prepare(`
  SELECT guild_id, user_id, job_id, rank, total_xp, xp_to_next, last_shift_at, created_at, updated_at
  FROM job_profiles
  WHERE guild_id = ? AND user_id = ?
  ORDER BY job_id ASC
`);
const updateJobProfileStmt = db.prepare(`
  UPDATE job_profiles
  SET rank = ?, total_xp = ?, xp_to_next = ?, last_shift_at = ?, updated_at = ?
  WHERE guild_id = ? AND user_id = ? AND job_id = ?
`);

const DEFAULT_SHIFT_STREAK_COUNT = 5;

const ensureJobStatusStmt = db.prepare(`
  INSERT OR IGNORE INTO job_status (guild_id, user_id, active_job, job_switch_available_at, cooldown_reason, daily_earning_cap, earned_today, cap_reset_at, shift_streak_count, shift_cooldown_expires_at, updated_at)
  VALUES (?, ?, 'none', 0, NULL, NULL, 0, NULL, ${DEFAULT_SHIFT_STREAK_COUNT}, 0, strftime('%s','now'))
`);
const selectJobStatusStmt = db.prepare(`
  SELECT active_job, job_switch_available_at, cooldown_reason, daily_earning_cap, earned_today, cap_reset_at, shift_streak_count, shift_cooldown_expires_at, updated_at
  FROM job_status
  WHERE guild_id = ? AND user_id = ?
`);
const updateJobStatusStmt = db.prepare(`
  UPDATE job_status
  SET active_job = ?, job_switch_available_at = ?, cooldown_reason = ?, daily_earning_cap = ?, earned_today = ?, cap_reset_at = ?, shift_streak_count = ?, shift_cooldown_expires_at = ?, updated_at = ?
  WHERE guild_id = ? AND user_id = ?
`);

const insertJobShiftStmt = db.prepare(`
  INSERT INTO job_shifts (id, guild_id, user_id, job_id, started_at, completed_at, performance_score, base_pay, tip_percent, tip_amount, total_payout, result_state, metadata_json)
  VALUES (?, ?, ?, ?, ?, NULL, 0, 0, 0, 0, 0, 'PENDING', ?)
`);
const updateJobShiftCompletionStmt = db.prepare(`
  UPDATE job_shifts
  SET completed_at = ?, performance_score = ?, base_pay = ?, tip_percent = ?, tip_amount = ?, total_payout = ?, result_state = ?, metadata_json = ?
  WHERE id = ?
`);
const selectJobShiftByIdStmt = db.prepare(`
  SELECT id, guild_id, user_id, job_id, started_at, completed_at, performance_score, base_pay, tip_percent, tip_amount, total_payout, result_state, metadata_json
  FROM job_shifts
  WHERE id = ?
`);
const selectRecentJobShiftsStmt = db.prepare(`
  SELECT id, guild_id, user_id, job_id, started_at, completed_at, performance_score, base_pay, tip_percent, tip_amount, total_payout, result_state, metadata_json
  FROM job_shifts
  WHERE guild_id = ? AND user_id = ?
  ORDER BY started_at DESC
  LIMIT COALESCE(?, 20)
`);

function canonicalGuildId(guildId) {
  return guildId ? String(guildId) : DEFAULT_GUILD_ID;
}

export function getModerators(guildId) {
  const ids = getAllModUsersStmt.all().map(r => String(r.user_id));
  return ids;
}

export function addModerator(guildId, userId) {
  const gid = canonicalGuildId(guildId);
  insertModUserStmt.run(gid, String(userId));
  return getModerators();
}

export function removeModerator(guildId, userId) {
  const id = String(userId);
  deleteModUserAllStmt.run(id);
  return getModerators();
}

export function getAdmins(guildId) {
  const ids = getAllAdminUsersStmt.all().map(r => String(r.user_id));
  return ids;
}

export function addAdmin(guildId, userId) {
  const gid = canonicalGuildId(guildId);
  insertAdminUserStmt.run(gid, String(userId));
  return getAdmins();
}

export function removeAdmin(guildId, userId) {
  const id = String(userId);
  deleteAdminUserAllStmt.run(id);
  return getAdmins();
}

export function getLastDailySpinAt(guildId, userId) {
  const gid = canonicalGuildId(guildId);
  const row = getDailySpinStmt.get(gid, String(userId));
  return row ? Number(row.last_ts || 0) : 0;
}

export function setLastDailySpinNow(guildId, userId, ts = Math.floor(Date.now() / 1000)) {
  const gid = canonicalGuildId(guildId);
  upsertDailySpinStmt.run(gid, String(userId), Number(ts));
  return ts;
}

export function getGuildSettings(guildId) {
  return getGuildSettingsStmt.get(guildId) || { log_channel_id: null, cash_log_channel_id: null, request_channel_id: null, update_channel_id: null, request_cooldown_sec: 0, logging_enabled: 0, max_ridebus_bet: 1000, casino_category_id: null, holdem_rake_bps: 0, holdem_rake_cap: 0, kitten_mode_enabled: 0 };
}

export function setGameLogChannel(guildId, channelId) {
  // Always resolve to 0/1 (never null)
  const current = getGuildSettings(guildId); // returns { log_channel_id, logging_enabled, max_ridebus_bet } or default
  const enabled = (current && typeof current.logging_enabled === 'number')
    ? (current.logging_enabled ? 1 : 0)
    : 0;

  // Ensure a row exists to preserve NOT NULL defaults
  ensureGuildSettingsStmt.run(guildId);
  upsertGuildSettingsStmt.run({
    guild_id: guildId,
    log_channel_id: channelId,
    cash_log_channel_id: null,
    request_channel_id: null,
    update_channel_id: null,
    request_cooldown_sec: null,
    logging_enabled: enabled,
    max_ridebus_bet: null,
    casino_category_id: null,
    holdem_rake_bps: null,
    holdem_rake_cap: null,
    kitten_mode_enabled: null
  });
  return getGuildSettings(guildId);
}

export function setLoggingEnabled(guildId, enabled) {
  // Ensure a row exists to avoid NOT NULL insert issues
  ensureGuildSettingsStmt.run(guildId);
  upsertGuildSettingsStmt.run({ guild_id: guildId, log_channel_id: null, cash_log_channel_id: null, request_channel_id: null, update_channel_id: null, request_cooldown_sec: null, logging_enabled: enabled ? 1 : 0, max_ridebus_bet: null, casino_category_id: null, holdem_rake_bps: null, holdem_rake_cap: null, kitten_mode_enabled: null });
  return getGuildSettings(guildId);
}

export function setMaxRidebusBet(guildId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('MAXBET_POSITIVE_INT');
  // Ensure a row exists; then update only the max bet
  ensureGuildSettingsStmt.run(guildId);
  upsertGuildSettingsStmt.run({ guild_id: guildId, log_channel_id: null, cash_log_channel_id: null, request_channel_id: null, update_channel_id: null, request_cooldown_sec: null, logging_enabled: null, max_ridebus_bet: amount, casino_category_id: null, holdem_rake_bps: null, holdem_rake_cap: null, kitten_mode_enabled: null });
  return getGuildSettings(guildId);
}

export function setDefaultHoldemRake(guildId, rakeBps, rakeCap = 0) {
  const bps = Math.max(0, Number(rakeBps) || 0);
  const cap = Math.max(0, Number(rakeCap) || 0);
  ensureGuildSettingsStmt.run(guildId);
  upsertGuildSettingsStmt.run({
    guild_id: guildId,
    log_channel_id: null,
    cash_log_channel_id: null,
    request_channel_id: null,
    update_channel_id: null,
    request_cooldown_sec: null,
    logging_enabled: null,
    max_ridebus_bet: null,
    casino_category_id: null,
    holdem_rake_bps: bps,
    holdem_rake_cap: cap,
    kitten_mode_enabled: null
  });
  return getGuildSettings(guildId);
}

export function setCashLogChannel(guildId, channelId) {
  const current = getGuildSettings(guildId);
  const enabled = (current && typeof current.logging_enabled === 'number') ? (current.logging_enabled ? 1 : 0) : 0;
  ensureGuildSettingsStmt.run(guildId);
  upsertGuildSettingsStmt.run({
    guild_id: guildId,
    log_channel_id: null,
    cash_log_channel_id: channelId,
    request_channel_id: null,
    update_channel_id: null,
    request_cooldown_sec: null,
    logging_enabled: enabled,
    max_ridebus_bet: null,
    casino_category_id: null,
    holdem_rake_bps: null,
    holdem_rake_cap: null,
    kitten_mode_enabled: null
  });
  return getGuildSettings(guildId);
}

export function setRequestChannel(guildId, channelId) {
  const current = getGuildSettings(guildId);
  const enabled = (current && typeof current.logging_enabled === 'number') ? (current.logging_enabled ? 1 : 0) : 0;
  ensureGuildSettingsStmt.run(guildId);
  upsertGuildSettingsStmt.run({
    guild_id: guildId,
    log_channel_id: null,
    cash_log_channel_id: null,
    request_channel_id: channelId,
    update_channel_id: null,
    request_cooldown_sec: null,
    logging_enabled: enabled,
    max_ridebus_bet: null,
    casino_category_id: null,
    holdem_rake_bps: null,
    holdem_rake_cap: null,
    kitten_mode_enabled: null
  });
  return getGuildSettings(guildId);
}

export function setUpdateChannel(guildId, channelId) {
  const current = getGuildSettings(guildId);
  const enabled = (current && typeof current.logging_enabled === 'number') ? (current.logging_enabled ? 1 : 0) : 0;
  ensureGuildSettingsStmt.run(guildId);
  upsertGuildSettingsStmt.run({
    guild_id: guildId,
    log_channel_id: null,
    cash_log_channel_id: null,
    request_channel_id: null,
    update_channel_id: channelId,
    request_cooldown_sec: null,
    logging_enabled: enabled,
    max_ridebus_bet: null,
    casino_category_id: null,
    holdem_rake_bps: null,
    holdem_rake_cap: null,
    kitten_mode_enabled: null
  });
  return getGuildSettings(guildId);
}

export function setRequestTimer(guildId, seconds) {
  const secs = Math.max(0, Number(seconds) || 0);
  ensureGuildSettingsStmt.run(guildId);
  upsertGuildSettingsStmt.run({ guild_id: guildId, log_channel_id: null, cash_log_channel_id: null, request_channel_id: null, update_channel_id: null, request_cooldown_sec: secs, logging_enabled: null, max_ridebus_bet: null, casino_category_id: null, holdem_rake_bps: null, holdem_rake_cap: null, kitten_mode_enabled: null });
  return getGuildSettings(guildId);
}

export function setCasinoCategory(guildId, categoryId) {
  ensureGuildSettingsStmt.run(guildId);
  upsertGuildSettingsStmt.run({
    guild_id: guildId,
    log_channel_id: null,
    cash_log_channel_id: null,
    request_channel_id: null,
    update_channel_id: null,
    request_cooldown_sec: null,
    logging_enabled: null,
    max_ridebus_bet: null,
    casino_category_id: categoryId,
    holdem_rake_bps: null,
    holdem_rake_cap: null,
    kitten_mode_enabled: null
  });
  return getGuildSettings(guildId);
}

export function setKittenMode(guildId, enabled) {
  ensureGuildSettingsStmt.run(guildId);
  upsertGuildSettingsStmt.run({
    guild_id: guildId,
    log_channel_id: null,
    cash_log_channel_id: null,
    request_channel_id: null,
    update_channel_id: null,
    request_cooldown_sec: null,
    logging_enabled: null,
    max_ridebus_bet: null,
    casino_category_id: null,
    holdem_rake_bps: null,
    holdem_rake_cap: null,
    kitten_mode_enabled: enabled ? 1 : 0
  });
  return getGuildSettings(guildId);
}

export function isKittenModeEnabled(guildId) {
  const settings = getGuildSettings(guildId);
  return !!(settings && settings.kitten_mode_enabled);
}

// Track last /request time per guild+user (epoch seconds)
db.exec(`
CREATE TABLE IF NOT EXISTS request_last (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  last_ts INTEGER NOT NULL,
  PRIMARY KEY (guild_id, user_id)
);
`);
const getLastReqStmt = db.prepare('SELECT last_ts FROM request_last WHERE guild_id = ? AND user_id = ?');
const upsertLastReqStmt = db.prepare(`
  INSERT INTO request_last (guild_id, user_id, last_ts) VALUES (?, ?, ?)
  ON CONFLICT(guild_id, user_id) DO UPDATE SET last_ts = excluded.last_ts
`);
export function getLastRequestAt(guildId, userId) {
  const row = getLastReqStmt.get(guildId, userId);
  return row ? Number(row.last_ts) : 0;
}
export function setLastRequestNow(guildId, userId, ts = null) {
  const t = ts ? Number(ts) : Math.floor(Date.now() / 1000);
  upsertLastReqStmt.run(guildId, userId, t);
  return t;
}


// Lookup an API key by bearer token; returns { id, guildId, scopes }
export function lookupApiKey(token) {
  if (!token) return null;
  const row = getApiKeyStmt.get(token);
  if (!row) return null;
  const scopes = String(row.scopes || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return { id: row.id, guildId: row.guild_id, scopes };
}

export function createApiKey({ token, guildId, scopes }) {
  if (!guildId) throw new Error('GUILD_ID_REQUIRED');
  if (!token) {
    token = crypto.randomBytes(24).toString('base64url');
  }
  const scopeStr = Array.isArray(scopes) ? scopes.join(',') : (scopes || '');
  try {
    insertApiKeyStmt.run(token, guildId, scopeStr);
  } catch (e) {
    if (String(e?.message || '').includes('UNIQUE')) throw new Error('TOKEN_EXISTS');
    throw e;
  }
  const row = db.prepare('SELECT id, token, guild_id, scopes FROM api_keys WHERE token = ?').get(token);
  return { id: row.id, token: row.token, guildId: row.guild_id, scopes: String(row.scopes || '').split(',').map(s => s.trim()).filter(Boolean) };
}

export function deleteApiKey(token) {
  if (!token) throw new Error('TOKEN_REQUIRED');
  const info = deleteApiKeyStmt.run(token);
  return { deleted: info.changes };
}

export function listApiKeys(guildId = null) {
  const rows = guildId
    ? db.prepare('SELECT id, token, guild_id, scopes FROM api_keys WHERE guild_id = ? ORDER BY id DESC').all(guildId)
    : listApiKeysStmt.all();
  return rows.map(r => ({ id: r.id, token: r.token, guildId: r.guild_id, scopes: String(r.scopes || '').split(',').map(s => s.trim()).filter(Boolean) }));
}

// ===== Hold'em helpers =====
const ensureTableStmt = db.prepare(`
  INSERT INTO holdem_tables (table_id, guild_id, channel_id, sb, bb, min, max, rake_bps, host_id)
  VALUES (@table_id, @guild_id, @channel_id, @sb, @bb, @min, @max, @rake_bps, @host_id)
  ON CONFLICT(table_id) DO UPDATE SET
    guild_id=excluded.guild_id,
    channel_id=excluded.channel_id,
    sb=excluded.sb,
    bb=excluded.bb,
    min=excluded.min,
    max=excluded.max,
    rake_bps=excluded.rake_bps,
    host_id=excluded.host_id
`);
const insertHandStmt = db.prepare('INSERT INTO holdem_hands (table_id, hand_no, board, winners_json, rake_paid) VALUES (?, ?, ?, ?, ?)');
const upsertEscrowStmt = db.prepare(`
  INSERT INTO holdem_escrow (table_id, user_id, balance) VALUES (?, ?, ?)
  ON CONFLICT(table_id, user_id) DO UPDATE SET balance = holdem_escrow.balance + excluded.balance
`);
const getEscrowStmt = db.prepare('SELECT balance FROM holdem_escrow WHERE table_id = ? AND user_id = ?');
const setEscrowExactStmt = db.prepare('UPDATE holdem_escrow SET balance = ? WHERE table_id = ? AND user_id = ?');
const insertCommitStmt = db.prepare('INSERT INTO holdem_commits (hand_id, user_id, street, amount) VALUES (?, ?, ?, ?)');
const listEscrowByTableStmt = db.prepare('SELECT user_id, balance FROM holdem_escrow WHERE table_id = ? AND balance > 0');
const getTableGuildStmt = db.prepare('SELECT guild_id FROM holdem_tables WHERE table_id = ?');

function guildForTable(tableId) {
  const row = getTableGuildStmt.get(String(tableId));
  return resolveGuildId(row?.guild_id);
}

export function ensureHoldemTable({ tableId, guildId, channelId, sb, bb, min, max, rakeBps, hostId }) {
  ensureTableStmt.run({ table_id: String(tableId), guild_id: String(guildId), channel_id: String(channelId), sb: Number(sb)||0, bb: Number(bb)||0, min: Number(min)||0, max: Number(max)||0, rake_bps: Number(rakeBps)||0, host_id: hostId ? String(hostId) : null });
  return { tableId: String(tableId) };
}

export function createHoldemHand(tableId, handNo, board = '', winnersJson = '[]', rakePaid = 0) {
  const info = insertHandStmt.run(String(tableId), Number(handNo)||0, String(board||''), String(winnersJson||'[]'), Number(rakePaid)||0);
  return info.lastInsertRowid;
}

export function getEscrowBalance(tableId, userId) {
  const row = getEscrowStmt.get(String(tableId), String(userId));
  return row ? Number(row.balance) : 0;
}

export function escrowAdd(tableId, userId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('ESCROW_POSITIVE');
  const gid = guildForTable(tableId);
  const tx = db.transaction(() => {
    ensureGuildUser(gid, userId);
    const row = getUserStmt.get(gid, userId);
    if ((row?.chips || 0) < amount) throw new Error('INSUFFICIENT_USER');
    addChipsStmt.run(-amount, gid, userId);
    upsertEscrowStmt.run(String(tableId), String(userId), amount);
    recordTxn(gid, String(userId), -amount, `holdem buy-in escrow ${tableId}`, null, 'CHIPS');
    recordTxn(gid, `ESCROW:${tableId}`, amount, `holdem buy-in from ${userId}`, null, 'CHIPS');
  });
  tx();
  return { escrow: getEscrowBalance(tableId, userId), user: getUserBalances(gid, userId).chips };
}

export function escrowReturn(tableId, userId, amount) {
  if (!Number.isInteger(amount) || amount <= 0) return 0;
  const gid = guildForTable(tableId);
  const tx = db.transaction(() => {
    const bal = getEscrowBalance(tableId, userId);
    const toReturn = Math.min(bal, amount);
    const newBal = bal - toReturn;
    setEscrowExactStmt.run(newBal, String(tableId), String(userId));
    addChipsStmt.run(toReturn, gid, String(userId));
    recordTxn(gid, `ESCROW:${tableId}`, -toReturn, `holdem refund to ${userId}`, null, 'CHIPS');
    recordTxn(gid, String(userId), toReturn, `holdem refund from escrow ${tableId}`, null, 'CHIPS');
  });
  tx();
  return getEscrowBalance(tableId, userId);
}

export function escrowCommit(tableId, userId, handId, street, amount) {
  if (!Number.isInteger(amount) || amount <= 0) return getEscrowBalance(tableId, userId);
  const gid = guildForTable(tableId);
  const tx = db.transaction(() => {
    const bal = getEscrowBalance(tableId, userId);
    if (bal < amount) throw new Error('ESCROW_INSUFFICIENT');
    setEscrowExactStmt.run(bal - amount, String(tableId), String(userId));
    insertCommitStmt.run(Number(handId)||0, String(userId), String(street||'UNK'), amount);
    recordTxn(gid, `ESCROW:${tableId}`, -amount, `holdem commit ${street} from ${userId}`, null, 'CHIPS');
    recordTxn(gid, `POT:${tableId}`, amount, `holdem commit ${street} from ${userId}`, null, 'CHIPS');
  });
  tx();
  return getEscrowBalance(tableId, userId);
}

export function escrowPayoutMany(tableId, payouts) {
  if (!Array.isArray(payouts) || !payouts.length) return true;
  const gid = guildForTable(tableId);
  const tx = db.transaction(() => {
    for (const p of payouts) {
      const userId = String(p.userId);
      const amt = Math.max(0, Number(p.amount) || 0);
      if (amt <= 0) continue;
      // Credit back to table escrow (chips remain at the table, not wallet)
      upsertEscrowStmt.run(String(tableId), userId, amt);
      recordTxn(gid, `POT:${tableId}`, -amt, `holdem payout to escrow for ${userId}`, null, 'CHIPS');
      recordTxn(gid, `ESCROW:${tableId}`, amt, `holdem payout to ${userId}`, null, 'CHIPS');
    }
  });
  tx();
  return true;
}

// Alias for clarity in Hold'em engine
export const escrowCreditMany = escrowPayoutMany;

export function settleRake(tableId, amount) {
  const amt = Math.max(0, Number(amount) || 0);
  if (amt <= 0) return 0;
  const gid = guildForTable(tableId);
  const tx = db.transaction(() => {
    ensureGuildHouse(gid);
    updateHouseStmt.run(amt, gid);
    recordTxn(gid, 'HOUSE', amt, `holdem rake ${tableId}`, null, 'CHIPS');
    recordTxn(gid, `POT:${tableId}`, -amt, `holdem rake ${tableId}`, null, 'CHIPS');
  });
  tx();
  return getHouseBalance(gid);
}

export function finalizeHoldemHand(handId, { board, winnersJson, rakePaid }) {
  db.prepare('UPDATE holdem_hands SET board = ?, winners_json = ?, rake_paid = ? WHERE hand_id = ?')
    .run(String(board||''), String(winnersJson||'[]'), Number(rakePaid)||0, Number(handId)||0);
}

export function listEscrowForTable(tableId) {
  return listEscrowByTableStmt.all(String(tableId));
}

// ----- Active request helpers -----
export function getActiveRequest(guildId, userId) {
  return getActiveReqStmt.get(guildId, userId) || null;
}
export function createActiveRequest(guildId, userId, messageId, type, amount) {
  if (!guildId || !userId || !messageId) throw new Error('ACTIVE_REQ_PARAMS');
  const normalizedType = String(type || 'unknown');
  let normalizedAmount = Number.isInteger(amount) ? amount : 0;
  if (normalizedType !== 'erase' && normalizedAmount <= 0) throw new Error('ACTIVE_REQ_AMOUNT');
  if (normalizedType === 'erase') normalizedAmount = 0;
  // Ensure none exists already; caller should check, but double-guard
  const existing = getActiveRequest(guildId, userId);
  if (existing) throw new Error('ACTIVE_REQ_EXISTS');
  insertActiveReqStmt.run(guildId, userId, messageId, normalizedType, normalizedAmount, 'PENDING');
  return getActiveRequest(guildId, userId);
}
export function updateActiveRequestStatus(guildId, userId, status) {
  updateActiveReqStatusStmt.run(String(status || 'PENDING'), guildId, userId);
  return getActiveRequest(guildId, userId);
}
export function clearActiveRequest(guildId, userId) {
  clearActiveReqStmt.run(guildId, userId);
  return true;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function normalizeJobProfileRow(guildId, userId, jobId, row = null) {
  return {
    guildId,
    userId,
    jobId,
    rank: row ? Math.max(1, toInt(row.rank, 1)) : 1,
    totalXp: row ? Math.max(0, toInt(row.total_xp, 0)) : 0,
    xpToNext: row ? Math.max(0, toInt(row.xp_to_next, 100)) : 100,
    lastShiftAt: row && row.last_shift_at !== null && row.last_shift_at !== undefined ? toInt(row.last_shift_at, null) : null,
    createdAt: row ? toInt(row.created_at, 0) : 0,
    updatedAt: row ? toInt(row.updated_at, 0) : 0
  };
}

function normalizeJobShiftRow(row = null) {
  if (!row) return null;
  return {
    id: row.id,
    guildId: row.guild_id,
    userId: row.user_id,
    jobId: row.job_id,
    startedAt: toInt(row.started_at, 0),
    completedAt: row.completed_at !== null && row.completed_at !== undefined ? toInt(row.completed_at, null) : null,
    performanceScore: toInt(row.performance_score, 0),
    basePay: toInt(row.base_pay, 0),
    tipPercent: toInt(row.tip_percent, 0),
    tipAmount: toInt(row.tip_amount, 0),
    totalPayout: toInt(row.total_payout, 0),
    resultState: row.result_state || 'PENDING',
    metadata: safeParseJson(row.metadata_json) || {}
  };
}

export function ensureJobProfile(guildId, userId, jobId) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  const jid = String(jobId || '').trim();
  if (!uid) throw new Error('JOB_PROFILE_USER_REQUIRED');
  if (!jid) throw new Error('JOB_PROFILE_JOB_REQUIRED');
  ensureJobProfileStmt.run(gid, uid, jid);
  const row = selectJobProfileStmt.get(gid, uid, jid);
  return normalizeJobProfileRow(gid, uid, jid, row);
}

export function getJobProfile(guildId, userId, jobId) {
  return ensureJobProfile(guildId, userId, jobId);
}

export function listJobProfilesForUser(guildId, userId) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('JOB_PROFILE_USER_REQUIRED');
  const rows = selectJobProfilesForUserStmt.all(gid, uid) || [];
  return rows.map(row => normalizeJobProfileRow(gid, uid, row.job_id, row));
}

export function updateJobProfile(guildId, userId, jobId, patch = {}) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  const jid = String(jobId || '').trim();
  if (!uid) throw new Error('JOB_PROFILE_USER_REQUIRED');
  if (!jid) throw new Error('JOB_PROFILE_JOB_REQUIRED');
  ensureJobProfileStmt.run(gid, uid, jid);
  const current = selectJobProfileStmt.get(gid, uid, jid) || {};
  const nextRank = patch.rank !== undefined ? Math.max(1, toInt(patch.rank, current.rank || 1)) : Math.max(1, toInt(current.rank, 1));
  const nextTotal = patch.totalXp !== undefined ? Math.max(0, toInt(patch.totalXp, current.total_xp || 0)) : Math.max(0, toInt(current.total_xp, 0));
  const nextXpToNext = patch.xpToNext !== undefined ? Math.max(0, toInt(patch.xpToNext, current.xp_to_next || 0)) : Math.max(0, toInt(current.xp_to_next, 0));
  const nextLastShift = patch.lastShiftAt === undefined
    ? (current.last_shift_at !== undefined ? current.last_shift_at : null)
    : (patch.lastShiftAt === null ? null : toInt(patch.lastShiftAt, null));
  const updatedAt = patch.updatedAt !== undefined ? toInt(patch.updatedAt, nowSeconds()) : nowSeconds();
  updateJobProfileStmt.run(
    nextRank,
    nextTotal,
    nextXpToNext,
    nextLastShift,
    updatedAt,
    gid,
    uid,
    jid
  );
  const row = selectJobProfileStmt.get(gid, uid, jid);
  return normalizeJobProfileRow(gid, uid, jid, row);
}

export function createJobShift(guildId, userId, jobId, options = {}) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  const jid = String(jobId || '').trim();
  if (!uid) throw new Error('JOB_SHIFT_USER_REQUIRED');
  if (!jid) throw new Error('JOB_SHIFT_JOB_REQUIRED');
  ensureJobProfileStmt.run(gid, uid, jid);
  const id = options.shiftId ? String(options.shiftId) : crypto.randomUUID();
  const startedAt = options.startedAt !== undefined ? toInt(options.startedAt, nowSeconds()) : nowSeconds();
  const metadata = options.metadata !== undefined ? options.metadata : {};
  const metadataJson = JSON.stringify(metadata || {});
  insertJobShiftStmt.run(id, gid, uid, jid, startedAt, metadataJson);
  const row = selectJobShiftByIdStmt.get(id);
  return normalizeJobShiftRow(row);
}

export function completeJobShift(shiftId, updates = {}) {
  const id = String(shiftId || '').trim();
  if (!id) throw new Error('JOB_SHIFT_ID_REQUIRED');
  const existing = selectJobShiftByIdStmt.get(id);
  if (!existing) throw new Error('JOB_SHIFT_NOT_FOUND');
  const completedAt = updates.completedAt !== undefined ? toInt(updates.completedAt, nowSeconds()) : nowSeconds();
  const performance = updates.performanceScore !== undefined ? toInt(updates.performanceScore, existing.performance_score || 0) : toInt(existing.performance_score, 0);
  const basePay = updates.basePay !== undefined ? toInt(updates.basePay, existing.base_pay || 0) : toInt(existing.base_pay, 0);
  const tipPercent = updates.tipPercent !== undefined ? toInt(updates.tipPercent, existing.tip_percent || 0) : toInt(existing.tip_percent, 0);
  const tipAmount = updates.tipAmount !== undefined ? toInt(updates.tipAmount, existing.tip_amount || 0) : toInt(existing.tip_amount, 0);
  const totalPayoutRaw = updates.totalPayout !== undefined
    ? toInt(updates.totalPayout, existing.total_payout || 0)
    : (basePay + tipAmount);
  const totalPayout = toInt(totalPayoutRaw, basePay + tipAmount);
  const resultState = (updates.resultState || existing.result_state || 'PENDING').toUpperCase();
  const metadataObj = updates.metadata !== undefined ? updates.metadata : safeParseJson(existing.metadata_json) || {};
  const metadataJson = JSON.stringify(metadataObj || {});
  updateJobShiftCompletionStmt.run(
    completedAt,
    performance,
    basePay,
    tipPercent,
    tipAmount,
    totalPayout,
    resultState,
    metadataJson,
    id
  );
  const row = selectJobShiftByIdStmt.get(id);
  return normalizeJobShiftRow(row);
}

export function getJobShiftById(shiftId) {
  const id = String(shiftId || '').trim();
  if (!id) throw new Error('JOB_SHIFT_ID_REQUIRED');
  const row = selectJobShiftByIdStmt.get(id);
  return normalizeJobShiftRow(row);
}

export function listJobShiftsForUser(guildId, userId, limit = 20) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('JOB_SHIFT_USER_REQUIRED');
  const lim = Math.max(1, Math.min(100, Number(limit) || 20));
  const rows = selectRecentJobShiftsStmt.all(gid, uid, lim) || [];
  return rows.map(normalizeJobShiftRow);
}

function toInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.trunc(num);
}

function toNullableInt(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.trunc(num);
}

function normalizeJobStatusRow(guildId, userId, row = null) {
  return {
    guild_id: guildId,
    user_id: userId,
    active_job: row?.active_job || 'none',
    job_switch_available_at: toInt(row?.job_switch_available_at, 0),
    cooldown_reason: row?.cooldown_reason || null,
    daily_earning_cap: toNullableInt(row?.daily_earning_cap),
    earned_today: toInt(row?.earned_today, 0),
    cap_reset_at: toNullableInt(row?.cap_reset_at),
    shift_streak_count: toInt(row?.shift_streak_count ?? DEFAULT_SHIFT_STREAK_COUNT, DEFAULT_SHIFT_STREAK_COUNT),
    shift_cooldown_expires_at: toInt(row?.shift_cooldown_expires_at, 0),
    updated_at: toInt(row?.updated_at, 0)
  };
}

export function getJobStatus(guildId, userId) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('JOB_STATUS_USER_REQUIRED');
  ensureJobStatusStmt.run(gid, uid);
  const row = selectJobStatusStmt.get(gid, uid) || null;
  return normalizeJobStatusRow(gid, uid, row);
}

export function setJobStatus(guildId, userId, patch = {}) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('JOB_STATUS_USER_REQUIRED');
  ensureJobStatusStmt.run(gid, uid);
  const current = selectJobStatusStmt.get(gid, uid) || {};
  const now = Math.floor(Date.now() / 1000);
  const next = {
    active_job: patch.active_job ?? current.active_job ?? 'none',
    job_switch_available_at: toInt(patch.job_switch_available_at ?? current.job_switch_available_at, 0),
    cooldown_reason: patch.cooldown_reason === undefined ? (current.cooldown_reason ?? null) : patch.cooldown_reason,
    daily_earning_cap: patch.daily_earning_cap === undefined ? (current.daily_earning_cap ?? null) : patch.daily_earning_cap,
    earned_today: toInt(patch.earned_today ?? current.earned_today, 0),
    cap_reset_at: patch.cap_reset_at === undefined ? (current.cap_reset_at ?? null) : patch.cap_reset_at,
    shift_streak_count: toInt(patch.shift_streak_count ?? current.shift_streak_count ?? DEFAULT_SHIFT_STREAK_COUNT, DEFAULT_SHIFT_STREAK_COUNT),
    shift_cooldown_expires_at: toInt(patch.shift_cooldown_expires_at ?? current.shift_cooldown_expires_at, 0)
  };
  updateJobStatusStmt.run(
    next.active_job,
    toInt(next.job_switch_available_at, 0),
    next.cooldown_reason ?? null,
    toNullableInt(next.daily_earning_cap),
    toInt(next.earned_today, 0),
    toNullableInt(next.cap_reset_at),
    toInt(next.shift_streak_count, 0),
    toInt(next.shift_cooldown_expires_at, 0),
    now,
    gid,
    uid
  );
  return getJobStatus(gid, uid);
}

export function resetAllBalances(guildId) {
  const gid = resolveGuildId(guildId);
  const run = db.transaction(() => {
    const usersBefore = countUsersStmt.get(gid)?.n || 0;
    const usersUpdated = resetUsersStmt.run(gid).changes;
    ensureGuildHouse(gid);
    resetHouseExactStmt.run(gid);
    return { guildId: gid, usersBefore, usersUpdated, house: houseRow(gid).chips };
  });
  return run();
}

export function setBotStatusSnapshot({ guildCount, playerCount }) {
  const guilds = Number.isFinite(Number(guildCount)) ? Number(guildCount) : 0;
  const players = Number.isFinite(Number(playerCount)) ? Number(playerCount) : 0;
  upsertBotStatusSnapshotStmt.run('global', guilds, players);
  return { guildCount: guilds, playerCount: players };
}

export function getBotStatusSnapshot() {
  const row = getBotStatusSnapshotStmt.get('global');
  if (!row) return null;
  return {
    guildCount: Number(row.guild_count || 0),
    playerCount: Number(row.player_count || 0),
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  };
}

export function getHouseBalance(guildId) {
  return houseRow(resolveGuildId(guildId)).chips;
}

export function getCasinoNetworth(guildId) {
  const gid = resolveGuildId(guildId);
  const house = houseRow(gid).chips;
  const row = sumUserChipsStmt.get(gid);
  const users = row ? Number(row.total || 0) : 0;
  return house + users;
}

export function getGlobalPlayerCount() {
  const row = countDistinctUsersStmt.get();
  return Number(row?.n || 0);
}

export function listAllUserIds() {
  const rows = listAllUserIdsStmt.all();
  return rows.map(row => String(row.discord_id));
}

export function getUserNewsSettings(userId) {
  const uid = String(userId || '').trim();
  if (!uid) {
    return {
      userId: null,
      newsOptIn: true,
      lastDeliveredAt: null,
      lastDigest: null
    };
  }
  const row = getUserNewsSettingsStmt.get(uid);
  if (!row) {
    return {
      userId: uid,
      newsOptIn: true,
      lastDeliveredAt: null,
      lastDigest: null
    };
  }
  let lastDeliveredAt = null;
  if (row.last_delivered_at !== null && row.last_delivered_at !== undefined) {
    const parsed = Number(row.last_delivered_at);
    lastDeliveredAt = Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }
  return {
    userId: uid,
    newsOptIn: !!row.news_opt_in,
    lastDeliveredAt,
    lastDigest: row.last_digest || null
  };
}

export function setUserNewsOptIn(userId, optIn) {
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('NEWS_USER_REQUIRED');
  const flag = optIn ? 1 : 0;
  setUserNewsOptInStmt.run(uid, flag);
  return getUserNewsSettings(uid);
}

export function markUserNewsDelivered(userId, digest, deliveredAt = nowSeconds()) {
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('NEWS_USER_REQUIRED');
  const ts = toInt(deliveredAt, nowSeconds());
  const normalizedDigest = digest ? String(digest).slice(0, 255) : null;
  recordUserNewsDeliveryStmt.run(uid, ts, normalizedDigest);
  return getUserNewsSettings(uid);
}

export function markUserFirstGameWin(guildId, userId, occurredAt = nowSeconds()) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('USER_REQUIRED');
  ensureGuildUser(gid, uid);
  const ts = toInt(occurredAt, nowSeconds());
  const result = setFirstGameWinStmt.run(ts, gid, uid);
  return result?.changes > 0;
}

export function getUserBalances(guildId, discordId) {
  const gid = resolveGuildId(guildId);
  ensureGuildUser(gid, discordId);
  const row = getUserStmt.get(gid, discordId) || { chips: 0, credits: 0 };
  return { chips: Number(row.chips || 0), credits: Number(row.credits || 0) };
}

export function getUserOnboardingStatus(guildId, userId) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const row = getUserOnboardingStmt.get(gid, uid);
  if (!row) return null;
  const acknowledgedAt = row.acknowledged_at !== null && row.acknowledged_at !== undefined
    ? toInt(row.acknowledged_at, null)
    : null;
  return {
    acknowledgedAt,
    chipsGranted: toInt(row.chips_granted ?? 0, 0)
  };
}

export function grantUserOnboardingBonus(guildId, userId, amount, reason = 'welcome bonus') {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  const amt = toInt(amount, 0);
  if (!uid) throw new Error('ONBOARD_USER_REQUIRED');
  if (!Number.isInteger(amt) || amt <= 0) {
    return { granted: false, status: getUserOnboardingStatus(gid, uid) };
  }
  const run = db.transaction(() => {
    ensureGuildUser(gid, uid);
    ensureUserOnboardingStmt.run(gid, uid);
    const current = getUserOnboardingStmt.get(gid, uid) || { acknowledged_at: null, chips_granted: 0 };
    const prevGranted = toInt(current.chips_granted ?? 0, 0);
    if (prevGranted >= amt) {
      return { granted: false };
    }
    addChipsStmt.run(amt, gid, uid);
    recordTxn(gid, uid, amt, reason || 'welcome bonus', null, 'CHIPS');
    updateUserOnboardingGrantStmt.run(amt, gid, uid);
    return { granted: true };
  });
  const result = run();
  const status = getUserOnboardingStatus(gid, uid);
  return {
    granted: result?.granted === true,
    status
  };
}

export function markUserOnboardingAcknowledged(guildId, userId, acknowledgedAt = nowSeconds()) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('ONBOARD_USER_REQUIRED');
  const ackTs = acknowledgedAt === null ? null : toInt(acknowledgedAt, nowSeconds());
  ensureUserOnboardingStmt.run(gid, uid);
  const info = ackTs === null ? { changes: 0 } : acknowledgeUserOnboardingStmt.run(ackTs, gid, uid);
  const status = getUserOnboardingStatus(gid, uid);
  return {
    acknowledged: info.changes > 0 && !!(status && status.acknowledgedAt !== null),
    status
  };
}

export function getTopUsers(guildId, limit = 10) {
  const gid = resolveGuildId(guildId);
  const n = Math.max(1, Math.min(25, Number(limit) || 10));
  return topUsersStmt.all(gid, n);
}

function recordTxn(guildId, account, delta, reason, adminId, currency) {
  insertTxnStmt.run(guildId, account, delta, reason || null, adminId || null, currency);
}

export function addToHouse(guildId, amount, reason, adminId) {
  const gid = resolveGuildId(guildId);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Amount must be a positive integer.');
  const run = db.transaction((amt) => {
    ensureGuildHouse(gid);
    updateHouseStmt.run(amt, gid);
    recordTxn(gid, 'HOUSE', amt, reason || 'house top-up', adminId, 'CHIPS');
  });
  run(amount);
  return getHouseBalance(gid);
}

export function transferFromHouseToUser(guildId, discordId, amount, reason, adminId) {
  const gid = resolveGuildId(guildId);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Amount must be a positive integer.');
  const run = db.transaction(() => {
    ensureGuildHouse(gid);
    const house = houseRow(gid);
    if (house.chips < amount) throw new Error('INSUFFICIENT_HOUSE');
    ensureGuildUser(gid, discordId);
    updateHouseStmt.run(-amount, gid);
    addChipsStmt.run(amount, gid, discordId);
    recordTxn(gid, discordId, amount, reason || 'admin grant', adminId, 'CHIPS');
    recordTxn(gid, 'HOUSE', -amount, `grant to ${discordId}${reason ? ': ' + reason : ''}`, adminId, 'CHIPS');
  });
  run();
  return { ...getUserBalances(gid, discordId), house: getHouseBalance(gid) };
}

export function removeFromHouse(guildId, amount, reason, adminId) {
  const gid = resolveGuildId(guildId);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Amount must be a positive integer.');
  const run = db.transaction((amt) => {
    ensureGuildHouse(gid);
    const house = houseRow(gid);
    if (house.chips < amt) throw new Error('INSUFFICIENT_HOUSE');
    updateHouseStmt.run(-amt, gid);
    recordTxn(gid, 'HOUSE', -amt, reason || 'house remove', adminId, 'CHIPS');
  });
  run(amount);
  return getHouseBalance(gid);
}

export function burnFromUser(guildId, discordId, amount, reason, adminId) {
  const gid = resolveGuildId(guildId);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Amount must be a positive integer.');
  const run = db.transaction(() => {
    ensureGuildUser(gid, discordId);
    const row = getUserStmt.get(gid, discordId);
    if ((row?.chips || 0) < amount) throw new Error('INSUFFICIENT_USER');
    addChipsStmt.run(-amount, gid, discordId);
    recordTxn(gid, discordId, -amount, reason || 'admin burn chips', adminId, 'CHIPS');
    recordTxn(gid, 'BURN', amount, `burn chips from ${discordId}${reason ? ': ' + reason : ''}`, adminId, 'CHIPS');
  });
  run();
  return getUserBalances(gid, discordId);
}

export function mintChips(guildId, discordId, amount, reason, adminId) {
  const gid = resolveGuildId(guildId);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Amount must be a positive integer.');
  const run = db.transaction(() => {
    ensureGuildUser(gid, discordId);
    addChipsStmt.run(amount, gid, discordId);
    recordTxn(gid, discordId, amount, reason || 'admin mint chips', adminId, 'CHIPS');
  });
  run();
  return getUserBalances(gid, discordId);
}

export function recordVoteReward(discordId, source, amount, metadata = {}, earnedAt = Math.floor(Date.now() / 1000), externalId = null) {
  const userId = String(discordId || '').trim();
  const src = String(source || '').trim();
  if (!userId) throw new Error('VOTE_REWARD_USER_REQUIRED');
  if (!src) throw new Error('VOTE_REWARD_SOURCE_REQUIRED');
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('VOTE_REWARD_AMOUNT_POSITIVE');
  const ts = Number.isInteger(earnedAt) && earnedAt > 0 ? earnedAt : Math.floor(Date.now() / 1000);
  const meta = metadata && Object.keys(metadata).length ? JSON.stringify(metadata) : null;
  const extId = externalId ? String(externalId).trim() || null : null;
  try {
    insertVoteRewardStmt.run(userId, src, amount, meta, ts, extId);
    return true;
  } catch (err) {
    const msg = String(err?.message || '').toUpperCase();
    if (msg.includes('UNIQUE') || msg.includes('CONSTRAINT')) {
      return false;
    }
    throw err;
  }
}

export function getPendingVoteRewards(discordId) {
  const userId = String(discordId || '').trim();
  if (!userId) return [];
  const rows = pendingVoteRewardsStmt.all(userId);
  return rows.map(row => ({
    id: row.id,
    source: row.source,
    reward_amount: Number(row.reward_amount || 0),
    earned_at: Number(row.earned_at || 0),
    metadata: row.metadata_json ? safeParseJson(row.metadata_json) : null
  }));
}

export function redeemVoteRewards(guildId, discordId, options = {}) {
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
      const existing = findUserGuildStmt.get(userId);
      if (existing?.guild_id) guildHint = existing.guild_id;
    }
  }
  const gid = resolveGuildId(guildHint);
  const reason = options?.reason ? String(options.reason) : 'vote reward';
  const adminId = options?.adminId ? String(options.adminId) : null;
  const limit = Number.isInteger(options?.limit) && options.limit > 0 ? options.limit : null;

  const result = db.transaction(() => {
    ensureGuildUser(gid, userId);
    const pendingRows = pendingVoteRewardsStmt.all(userId);
    const selected = limit ? pendingRows.slice(0, limit) : pendingRows;
    if (!selected.length) {
      const balance = getUserStmt.get(gid, userId) || { chips: 0, credits: 0 };
      return {
        claimedTotal: 0,
        claimedCount: 0,
        claimedRewards: [],
        balances: { chips: Number(balance.chips || 0), credits: Number(balance.credits || 0) },
        remaining: pendingRows.length
      };
    }

    let total = 0;
    for (const row of selected) total += Number(row.reward_amount || 0);
    if (!Number.isInteger(total) || total <= 0) {
      const balance = getUserStmt.get(gid, userId) || { chips: 0, credits: 0 };
      return {
        claimedTotal: 0,
        claimedCount: 0,
        claimedRewards: [],
        balances: { chips: Number(balance.chips || 0), credits: Number(balance.credits || 0) },
        remaining: pendingRows.length
      };
    }

    addChipsStmt.run(total, gid, userId);
    recordTxn(gid, userId, total, reason || 'vote reward', adminId, 'CHIPS');
    const now = Math.floor(Date.now() / 1000);
    for (const row of selected) {
      markVoteRewardClaimedStmt.run(now, gid, row.id);
    }
    const balance = getUserStmt.get(gid, userId) || { chips: 0, credits: 0 };
    const claimedRewards = selected.map(row => ({
      id: row.id,
      source: row.source,
      reward_amount: Number(row.reward_amount || 0),
      earned_at: Number(row.earned_at || 0),
      metadata: row.metadata_json ? safeParseJson(row.metadata_json) : null
    }));
    return {
      claimedTotal: total,
      claimedCount: selected.length,
      claimedRewards,
      balances: { chips: Number(balance.chips || 0), credits: Number(balance.credits || 0) },
      remaining: pendingRows.length - selected.length
    };
  })();

  return result;
}

export function listUsersWithPendingVoteRewards(limit = 50) {
  const n = Math.max(1, Math.min(500, Number(limit) || 50));
  return listPendingVoteUsersStmt.all(n).map(row => row.discord_user_id);
}

export function eraseUserData(discordId) {
  const userId = String(discordId || '').trim();
  if (!userId) throw new Error('ERASE_USER_ID_REQUIRED');
  const result = db.transaction(() => {
    const deleted = {
      users: deleteUsersAllStmt.run(userId).changes,
      transactions: deleteTransactionsByAccountStmt.run(userId).changes,
      dailySpin: deleteDailySpinEntriesStmt.run(userId).changes,
      requestLast: deleteRequestLastEntriesStmt.run(userId).changes,
      voteRewards: deleteVoteRewardsStmt.run(userId).changes,
      jobProfiles: deleteJobProfilesStmt.run(userId).changes,
      jobStatus: deleteJobStatusStmt.run(userId).changes,
      jobShifts: deleteJobShiftsStmt.run(userId).changes,
      activeRequests: deleteActiveReqAllStmt.run(userId).changes,
      holdemEscrow: deleteHoldemEscrowStmt.run(userId).changes,
      holdemCommits: deleteHoldemCommitsStmt.run(userId).changes,
      modAssignments: deleteModUserAllStmt.run(userId).changes,
      adminAssignments: deleteAdminUserAllStmt.run(userId).changes,
      onboarding: deleteUserOnboardingStmt.run(userId).changes
    };
    const updated = {
      transactionsAdmin: clearTransactionsAdminStmt.run(userId).changes,
      holdemTablesHost: clearHoldemHostStmt.run(userId).changes
    };
    return { userId, deleted, updated };
  });
  return result;
}

export function takeFromUserToHouse(guildId, discordId, amount, reason, adminId) {
  const gid = resolveGuildId(guildId);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Amount must be a positive integer.');
  const run = db.transaction(() => {
    ensureGuildHouse(gid);
    ensureGuildUser(gid, discordId);
    const row = getUserStmt.get(gid, discordId);
    if ((row?.chips || 0) < amount) throw new Error('INSUFFICIENT_USER');
    addChipsStmt.run(-amount, gid, discordId);
    updateHouseStmt.run(amount, gid);
    recordTxn(gid, discordId, -amount, reason || 'game stake', adminId, 'CHIPS');
    recordTxn(gid, 'HOUSE', amount, `stake from ${discordId}${reason ? ': ' + reason : ''}`, adminId, 'CHIPS');
  });
  run();
  return { ...getUserBalances(gid, discordId), house: getHouseBalance(gid) };
}

export function grantCredits(guildId, discordId, amount, reason, adminId) {
  const gid = resolveGuildId(guildId);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Amount must be a positive integer.');
  const run = db.transaction(() => {
    ensureGuildUser(gid, discordId);
    addCreditsStmt.run(amount, gid, discordId);
    recordTxn(gid, discordId, amount, reason || 'admin grant credits', adminId, 'CREDITS');
  });
  run();
  return getUserBalances(gid, discordId);
}

export function burnCredits(guildId, discordId, amount, reason, adminId) {
  const gid = resolveGuildId(guildId);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Amount must be a positive integer.');
  const run = db.transaction(() => {
    ensureGuildUser(gid, discordId);
    const row = getUserStmt.get(gid, discordId);
    if ((row?.credits || 0) < amount) throw new Error('INSUFFICIENT_USER_CREDITS');
    addCreditsStmt.run(-amount, gid, discordId);
    recordTxn(gid, discordId, -amount, reason || 'admin burn credits', adminId, 'CREDITS');
    recordTxn(gid, 'BURN', amount, `burn credits from ${discordId}${reason ? ': ' + reason : ''}`, adminId, 'CREDITS');
  });
  run();
  return getUserBalances(gid, discordId);
}

export function gameLoseWithCredits(guildId, discordId, amount, detail) {
  const gid = resolveGuildId(guildId);
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('Amount must be a positive integer.');
  const run = db.transaction(() => {
    ensureGuildUser(gid, discordId);
    const row = getUserStmt.get(gid, discordId);
    if ((row?.credits || 0) < amount) throw new Error('INSUFFICIENT_USER_CREDITS');
    addCreditsStmt.run(-amount, gid, discordId);
    recordTxn(gid, discordId, -amount, `game loss (credits)${detail ? ': ' + detail : ''}`, null, 'CREDITS');
    recordTxn(gid, 'BURN', amount, `game loss from ${discordId}${detail ? ': ' + detail : ''}`, null, 'CREDITS');
  });
  run();
  return getUserBalances(gid, discordId);
}

export function gameWinWithCredits(guildId, discordId, amount, detail) {
  return transferFromHouseToUser(guildId, discordId, amount, `game win (credits)${detail ? ': ' + detail : ''}`, null);
}

// --- Cartel Passive System ---
export function getCartelPool(guildId) {
  const gid = resolveGuildId(guildId);
  ensureCartelPool(gid);
  const row = getCartelPoolStmt.get(gid);
  return normalizeCartelPool(row) || {
    guild_id: gid,
    total_shares: 0,
    base_rate_mg_per_hour: CARTEL_DEFAULT_BASE_RATE_MG_PER_HOUR,
    share_price: CARTEL_DEFAULT_SHARE_PRICE,
    share_rate_mg_per_hour: CARTEL_DEFAULT_SHARE_RATE_MG_PER_HOUR,
    xp_per_gram_sold: CARTEL_DEFAULT_XP_PER_GRAM_SOLD,
    carryover_mg: 0,
    last_tick_at: null,
    event_state: null
  };
}

export function setCartelSharePrice(guildId, sharePrice) {
  const gid = resolveGuildId(guildId);
  const price = Math.max(1, Math.floor(Number(sharePrice || 0)));
  if (!Number.isInteger(price) || price <= 0) throw new Error('CARTEL_SHARE_PRICE_INVALID');
  ensureCartelPool(gid);
  setCartelSharePriceStmt.run(price, gid);
  return getCartelPool(gid);
}

export function setCartelShareRate(guildId, shareRateMgPerHour) {
  const gid = resolveGuildId(guildId);
  const rate = Math.max(1, Math.floor(Number(shareRateMgPerHour || 0)));
  ensureCartelPool(gid);
  setCartelShareRateStmt.run(rate, gid);
  return getCartelPool(gid);
}

export function setCartelXpPerGram(guildId, xpPerGram) {
  const gid = resolveGuildId(guildId);
  const rate = Math.max(0, Number(xpPerGram || 0));
  ensureCartelPool(gid);
  setCartelXpPerGramStmt.run(rate, gid);
  return getCartelPool(gid);
}

export function listCartelInvestors(guildId) {
  const gid = resolveGuildId(guildId);
  ensureCartelPool(gid);
  const rows = listCartelInvestorsStmt.all(gid) || [];
  return rows.map(normalizeCartelInvestor).filter(Boolean);
}

export function getCartelInvestor(guildId, userId) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) return null;
  ensureCartelInvestor(gid, uid);
  const row = getCartelInvestorStmt.get(gid, uid);
  return normalizeCartelInvestor(row);
}

export function cartelAddShares(guildId, userId, deltaShares) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  const shares = Number(deltaShares || 0);
  if (!uid) throw new Error('CARTEL_USER_REQUIRED');
  if (!Number.isInteger(shares) || shares <= 0) throw new Error('CARTEL_INVALID_SHARES');
  const run = db.transaction(() => {
    ensureCartelInvestor(gid, uid);
    updateCartelPoolSharesStmt.run(shares, gid);
    addCartelInvestorSharesStmt.run(shares, gid, uid);
  });
  run();
  return getCartelInvestor(gid, uid);
}

export function cartelSetHoldings(guildId, userId, stashMg, warehouseMg) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('CARTEL_USER_REQUIRED');
  const stash = Math.max(0, Math.floor(Number(stashMg || 0)));
  const warehouse = Math.max(0, Math.floor(Number(warehouseMg || 0)));
  ensureCartelInvestor(gid, uid);
  setCartelInvestorHoldingsStmt.run(stash, warehouse, gid, uid);
  return getCartelInvestor(gid, uid);
}

export function cartelSetRankAndXp(guildId, userId, rank, rankXp) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('CARTEL_USER_REQUIRED');
  const r = Math.max(1, Math.min(10, Number(rank || 1)));
  const xp = Math.max(0, Math.floor(Number(rankXp || 0)));
  ensureCartelInvestor(gid, uid);
  setCartelInvestorRankStmt.run(r, xp, gid, uid);
  return getCartelInvestor(gid, uid);
}

export function cartelSetAutoSellRule(guildId, userId, rule) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('CARTEL_USER_REQUIRED');
  const payload = rule == null ? null : JSON.stringify(rule);
  ensureCartelInvestor(gid, uid);
  setCartelInvestorAutoRuleStmt.run(payload, gid, uid);
  return getCartelInvestor(gid, uid);
}

export function cartelResetInvestor(guildId, userId) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('CARTEL_USER_REQUIRED');
  const run = db.transaction(() => {
    ensureCartelInvestor(gid, uid);
    const current = getCartelInvestorStmt.get(gid, uid);
    const shares = Number(current?.shares || 0);
    if (shares) {
      updateCartelPoolSharesStmt.run(-shares, gid);
    }
    resetCartelInvestorStmt.run(gid, uid);
    deleteCartelDealersForUserStmt.run(gid, uid);
    return normalizeCartelInvestor(getCartelInvestorStmt.get(gid, uid));
  });
  return run();
}

export function cartelAddDealerPending(guildId, dealerId, chipsDelta, mgDelta) {
  const gid = resolveGuildId(guildId);
  const did = String(dealerId || '').trim();
  if (!did) return;
  const chips = Math.floor(Number(chipsDelta || 0));
  const mg = Math.floor(Number(mgDelta || 0));
  if (!chips && !mg) return;
  addCartelDealerPendingStmt.run(chips, mg, gid, did);
}

export function cartelClearDealerPending(guildId, entries = []) {
  const gid = resolveGuildId(guildId);
  clearCartelDealerPendingTx(gid, Array.isArray(entries) ? entries : []);
}

export function cartelApplyProduction(guildId, updates = [], { lastTickAt = null, carryoverMg = null } = {}) {
  const gid = resolveGuildId(guildId);
  const list = Array.isArray(updates) ? updates : [];
  const run = db.transaction(() => {
    ensureCartelPool(gid);
    if (lastTickAt !== null || carryoverMg !== null) {
      const lt = lastTickAt !== null && lastTickAt !== undefined ? Number(lastTickAt) : null;
      const co = carryoverMg !== null && carryoverMg !== undefined
        ? Math.max(0, Math.floor(Number(carryoverMg)))
        : 0;
      setCartelPoolTickStmt.run(lt, co, gid);
    }
    for (const entry of list) {
      if (!entry || !entry.userId) continue;
      const uid = String(entry.userId);
      ensureCartelInvestor(gid, uid);
      const stash = Math.max(0, Math.floor(Number(entry.stashMg ?? entry.stash_mg ?? 0)));
      const warehouse = Math.max(0, Math.floor(Number(entry.warehouseMg ?? entry.warehouse_mg ?? 0)));
      const rank = Math.max(1, Math.min(10, Number(entry.rank ?? 1)));
      const rankXp = Math.max(0, Math.floor(Number(entry.rankXp ?? entry.rank_xp ?? 0)));
      setCartelInvestorStateStmt.run(stash, warehouse, rank, rankXp, gid, uid);
    }
  });
  run();
}

export function cartelUpdatePoolTick(guildId, lastTickAt, carryoverMg = 0) {
  const gid = resolveGuildId(guildId);
  ensureCartelPool(gid);
  const lt = lastTickAt !== null && lastTickAt !== undefined ? Number(lastTickAt) : null;
  const co = Math.max(0, Math.floor(Number(carryoverMg || 0)));
  setCartelPoolTickStmt.run(lt, co, gid);
  return getCartelPool(gid);
}

export function recordCartelTransaction(guildId, userId, type, amountChips, amountMg, metadata = null) {
  const gid = resolveGuildId(guildId);
  const uid = userId ? String(userId) : null;
  const chips = Math.floor(Number(amountChips || 0));
  const mg = Math.floor(Number(amountMg || 0));
  const meta = metadata ? JSON.stringify(metadata) : null;
  recordCartelTxnStmt.run(gid, uid, String(type || 'UNKNOWN'), chips, mg, meta);
}

export function cartelCreateDealer(guildId, dealerId, userId, payload) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) throw new Error('CARTEL_USER_REQUIRED');
  insertCartelDealerStmt.run(
    dealerId,
    gid,
    uid,
    Math.max(0, Number(payload?.tier ?? 0)),
    payload?.trait || null,
    payload?.display_name || null,
    payload?.status || 'ACTIVE',
    Math.max(0, Math.floor(Number(payload?.hourly_sell_cap_mg || 0))),
    Math.max(1, Math.floor(Number(payload?.price_multiplier_bps || 10000))),
    Math.max(0, Math.floor(Number(payload?.upkeep_cost || 0))),
    Math.max(60, Math.floor(Number(payload?.upkeep_interval_seconds || 3600))),
    Math.max(0, Math.floor(Number(payload?.upkeep_due_at || 0))),
    payload?.bust_until ? Math.floor(Number(payload?.bust_until)) : null,
    payload?.last_sold_at ? Math.floor(Number(payload?.last_sold_at)) : null
  );
  return getCartelDealer(gid, dealerId);
}

export function cartelDeleteDealer(guildId, dealerId) {
  const gid = resolveGuildId(guildId);
  if (!dealerId) return 0;
  return deleteCartelDealerStmt.run(gid, dealerId).changes;
}

export function cartelDeleteDealersForUser(guildId, userId) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) return 0;
  return deleteCartelDealersForUserStmt.run(gid, uid).changes;
}

export function listCartelGuildIds() {
  const rows = listCartelGuildIdsStmt.all() || [];
  return rows
    .map(row => String(row?.guild_id || '').trim())
    .filter(Boolean);
}

export function listCartelDealers(guildId) {
  const gid = resolveGuildId(guildId);
  const rows = listCartelDealersStmt.all(gid) || [];
  return rows.map(normalizeCartelDealer).filter(Boolean);
}

export function listCartelDealersForUser(guildId, userId) {
  const gid = resolveGuildId(guildId);
  const uid = String(userId || '').trim();
  if (!uid) return [];
  const rows = listCartelDealersForUserStmt.all(gid, uid) || [];
  return rows.map(normalizeCartelDealer).filter(Boolean);
}

export function getCartelDealer(guildId, dealerId) {
  const gid = resolveGuildId(guildId);
  if (!dealerId) return null;
  const row = getCartelDealerStmt.get(gid, dealerId);
  return normalizeCartelDealer(row);
}

export function cartelSetDealerStatus(guildId, dealerId, status) {
  const gid = resolveGuildId(guildId);
  if (!dealerId) throw new Error('CARTEL_DEALER_REQUIRED');
  updateCartelDealerStatusStmt.run(String(status || 'ACTIVE'), gid, dealerId);
  return getCartelDealer(gid, dealerId);
}

export function cartelSetDealerUpkeep(guildId, dealerId, upkeepDueAt, status = null) {
  const gid = resolveGuildId(guildId);
  if (!dealerId) throw new Error('CARTEL_DEALER_REQUIRED');
  const due = upkeepDueAt !== null && upkeepDueAt !== undefined ? Math.floor(Number(upkeepDueAt)) : 0;
  const statusValue = status || 'ACTIVE';
  updateCartelDealerUpkeepStmt.run(due, statusValue, gid, dealerId);
  return getCartelDealer(gid, dealerId);
}

export function cartelRecordDealerSale(guildId, dealerId, mgSold, soldAtSeconds, chipRemainderUnits = null) {
  const gid = resolveGuildId(guildId);
  if (!dealerId) throw new Error('CARTEL_DEALER_REQUIRED');
  const mg = Math.max(0, Math.floor(Number(mgSold || 0)));
  const ts = Math.floor(Number(soldAtSeconds || Date.now() / 1000));
  const remainder = chipRemainderUnits == null ? null : Math.max(0, Math.floor(Number(chipRemainderUnits)));
  updateCartelDealerSaleStmt.run(ts, mg, remainder, gid, dealerId);
  return getCartelDealer(gid, dealerId);
}
