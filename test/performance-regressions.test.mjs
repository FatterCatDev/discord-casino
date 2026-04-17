import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();

async function readRepoFile(relPath) {
  const fullPath = path.join(repoRoot, relPath);
  return readFile(fullPath, 'utf8');
}

test('db pool includes explicit tuning options', async () => {
  const content = await readRepoFile('src/db/db.pg.mjs');
  assert.match(content, /new Pool\s*\(\s*\{/);
  assert.match(content, /max:\s*Math\.max\(1,\s*Number\(process\.env\.PGPOOL_MAX\s*\|\|\s*20\)\)/);
  assert.match(content, /idleTimeoutMillis:\s*Math\.max\(1_000,\s*Number\(process\.env\.PGPOOL_IDLE_TIMEOUT_MS\s*\|\|\s*30_000\)\)/);
  assert.match(content, /connectionTimeoutMillis:\s*Math\.max\(1_000,\s*Number\(process\.env\.PGPOOL_CONNECTION_TIMEOUT_MS\s*\|\|\s*10_000\)\)/);
});

test('getUserBalances no longer performs ensureGuildUser write', async () => {
  const content = await readRepoFile('src/db/db.pg.mjs');
  const fn = content.match(/export async function getUserBalances\([\s\S]*?\n}\n/);
  assert.ok(fn, 'getUserBalances function should exist');
  assert.doesNotMatch(fn[0], /ensureGuildUser\(/);
  assert.match(fn[0], /SELECT chips, credits FROM users/);
});

test('houseRow no longer performs ensureGuildHouse write', async () => {
  const content = await readRepoFile('src/db/db.pg.mjs');
  const fn = content.match(/async function houseRow\([\s\S]*?\n}\n/);
  assert.ok(fn, 'houseRow function should exist');
  assert.doesNotMatch(fn[0], /ensureGuildHouse\(/);
  assert.match(fn[0], /SELECT chips FROM guild_house/);
});

test('getTopUsers excludes admin/mod users with NOT EXISTS', async () => {
  const content = await readRepoFile('src/db/db.pg.mjs');
  const fn = content.match(/export async function getTopUsers\([\s\S]*?\n}\n/);
  assert.ok(fn, 'getTopUsers function should exist');
  assert.match(fn[0], /NOT EXISTS \(SELECT 1 FROM admin_users/);
  assert.match(fn[0], /NOT EXISTS \(SELECT 1 FROM mod_users/);
  assert.doesNotMatch(fn[0], /NOT IN \(SELECT user_id FROM admin_users\)/);
  assert.doesNotMatch(fn[0], /NOT IN \(SELECT user_id FROM mod_users\)/);
});

test('pruneUserInteractionEvents is exported and batch-limited', async () => {
  const dbContent = await readRepoFile('src/db/db.pg.mjs');
  const autoContent = await readRepoFile('src/db/db.auto.mjs');
  const fn = dbContent.match(/export async function pruneUserInteractionEvents\([\s\S]*?\n}\n/);
  assert.ok(fn, 'pruneUserInteractionEvents function should exist');
  assert.match(fn[0], /LIMIT \$2/);
  assert.match(fn[0], /WHERE created_at < \$1/);
  assert.match(autoContent, /export const pruneUserInteractionEvents = pick\('pruneUserInteractionEvents'\);/);
});

test('cartel read paths do not perform implicit row-creation writes', async () => {
  const content = await readRepoFile('src/db/db.pg.mjs');
  const poolFn = content.match(/export async function getCartelPool\([\s\S]*?\n}\n/);
  const listFn = content.match(/export async function listCartelInvestors\([\s\S]*?\n}\n/);
  const investorFn = content.match(/export async function getCartelInvestor\([\s\S]*?\n}\n/);
  assert.ok(poolFn, 'getCartelPool function should exist');
  assert.ok(listFn, 'listCartelInvestors function should exist');
  assert.ok(investorFn, 'getCartelInvestor function should exist');
  assert.doesNotMatch(poolFn[0], /ensureCartelPoolRow\(/);
  assert.doesNotMatch(listFn[0], /ensureCartelPoolRow\(/);
  assert.doesNotMatch(investorFn[0], /ensureCartelInvestorRow\(/);
});

test('index interaction handlers no longer use dynamic imports', async () => {
  const content = await readRepoFile('src/index.mjs');
  assert.doesNotMatch(content, /await import\('\.\/interactions/);
});

test('index includes cache constants and cache invalidation sets', async () => {
  const content = await readRepoFile('src/index.mjs');
  assert.match(content, /const GUILD_SETTINGS_TTL_MS =/);
  assert.match(content, /const ACCESS_LIST_TTL_MS =/);
  assert.match(content, /const ACTIVE_NEWS_TTL_MS =/);
  assert.match(content, /const SETTINGS_MUTATION_COMMANDS = new Set\(/);
  assert.match(content, /const ACCESS_MUTATION_COMMANDS = new Set\(/);
});

test('new game command wrappers no longer block on prior session cleanup', async () => {
  const content = await readRepoFile('src/index.mjs');
  const ridebus = content.match(/startRideBus:\s*async\s*\(interaction, bet\)\s*=>\s*\{[\s\S]*?\n\s*\},/);
  const blackjack = content.match(/startBlackjack:\s*async\s*\(interaction, table, bet\)\s*=>\s*\{[\s\S]*?\n\s*\},/);
  const slots = content.match(/runSlotsSpin:\s*async\s*\(interaction, bet, key\)\s*=>\s*\{[\s\S]*?\n\s*\},/);
  const roulette = content.match(/startRouletteSession:\s*async\s*\(interaction\)\s*=>\s*\{[\s\S]*?\n\s*\},/);
  for (const fn of [ridebus, blackjack, slots, roulette]) {
    assert.ok(fn, 'game wrapper should exist');
    assert.doesNotMatch(fn[0], /await waitForSessionCleanup\(/);
  }
});

test('session cleanup detaches state before async work', async () => {
  const sessionContent = await readRepoFile('src/games/session.mjs');
  const loggingContent = await readRepoFile('src/games/logging.mjs');
  assert.match(sessionContent, /function detachSessionForCleanup\(/);
  assert.match(sessionContent, /const detached = detachSessionForCleanup\(guildId, userId\);/);
  assert.match(sessionContent, /activeSessions\.delete\(k\);/);
  assert.match(loggingContent, /activeSessions\.delete\(key\);/);
});

test('todo list includes top-priority scalability work', async () => {
  const content = await readRepoFile('docs/TO-DO.md');
  assert.match(content, /# Top Priority: Performance \+ Scale Work/);
  assert.match(content, /Make cartel read paths pure reads with no implicit row creation/);
});

test('champion role sync avoids full guild member fetch on startup', async () => {
  const content = await readRepoFile('src/services/championRole.mjs');
  assert.doesNotMatch(content, /guild\.members\.fetch\(\)/);
  assert.match(content, /guild\.members\.fetch\(\{ user: topUserId, force: true \}\)/);
});
