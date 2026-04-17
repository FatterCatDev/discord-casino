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
  assert.match(fn[0], /a\.guild_id = users\.guild_id/);
  assert.match(fn[0], /m\.guild_id = users\.guild_id/);
  assert.doesNotMatch(fn[0], /NOT IN \(SELECT user_id FROM admin_users\)/);
  assert.doesNotMatch(fn[0], /NOT IN \(SELECT user_id FROM mod_users\)/);
});

test('leaderboard uses DB aggregates instead of per-admin balance fan-out and full cartel investor scans', async () => {
  const command = await readRepoFile('src/commands/leaderboard.mjs');
  const db = await readRepoFile('src/db/db.pg.mjs');
  const adapter = await readRepoFile('src/db/db.auto.mjs');
  assert.match(command, /getAdminChipTotal/);
  assert.match(command, /getCartelShareLeaders/);
  assert.match(command, /getCartelStaffShareTotal/);
  assert.doesNotMatch(command, /ctx\?\.getUserBalances/);
  assert.doesNotMatch(command, /listCartelInvestors\(/);
  assert.match(db, /export async function getAdminChipTotal\(/);
  assert.match(db, /export async function getCartelShareLeaders\(/);
  assert.match(db, /export async function getCartelStaffShareTotal\(/);
  assert.match(adapter, /export const getAdminChipTotal = pick\('getAdminChipTotal'\);/);
  assert.match(adapter, /export const getCartelShareLeaders = pick\('getCartelShareLeaders'\);/);
  assert.match(adapter, /export const getCartelStaffShareTotal = pick\('getCartelStaffShareTotal'\);/);
});

test('leaderboard caches names and resolves them once across chip and share views', async () => {
  const command = await readRepoFile('src/commands/leaderboard.mjs');
  assert.match(command, /const LEADERBOARD_NAME_CACHE_TTL_MS =/);
  assert.match(command, /const LEADERBOARD_NAME_CACHE_MAX =/);
  assert.match(command, /const LEADERBOARD_NAME_RESOLUTION_CONCURRENCY =/);
  assert.match(command, /const leaderboardNameCache = new Map\(\);/);
  assert.match(command, /async function resolveLeaderboardNames\(/);
  assert.match(command, /const allUserIds = Array\.from\(new Set\(\[/);
  assert.match(command, /const resolvedNames = await resolveLeaderboardNames\(interaction, allUserIds\);/);
  assert.match(command, /resolvedNames\.get\(String\(r\.discord_id\)\)/);
  assert.match(command, /resolvedNames\.get\(String\(inv\.user_id\)\)/);
  assert.match(command, /while \(leaderboardNameCache\.size > LEADERBOARD_NAME_CACHE_MAX\)/);
});

test('startup holdem orphan cleanup is queued in delayed background batches', async () => {
  const content = await readRepoFile('src/index.mjs');
  assert.match(content, /const HOLDEM_ORPHAN_SWEEP_START_DELAY_MS =/);
  assert.match(content, /const HOLDEM_ORPHAN_SWEEP_GUILD_BATCH_SIZE =/);
  assert.match(content, /const HOLDEM_ORPHAN_SWEEP_BATCH_INTERVAL_MS =/);
  assert.match(content, /function scheduleStartupHoldemOrphanSweep\(client\)/);
  assert.match(content, /function processHoldemOrphanSweepBatch\(client\)/);
  assert.match(content, /scheduleStartupHoldemOrphanSweep\(client\);/);
  assert.doesNotMatch(content, /On startup, sweep orphan Hold'em table channels under the casino category/);
});

test('holdem table allocation uses DB reservation instead of full channel fetch scanning', async () => {
  const holdem = await readRepoFile('src/games/holdem.mjs');
  const db = await readRepoFile('src/db/db.pg.mjs');
  const adapter = await readRepoFile('src/db/db.auto.mjs');
  assert.match(holdem, /reserveHoldemTableNumber/);
  assert.match(holdem, /tableNumber = await reserveHoldemTableNumber\(interaction\.guild\.id\);/);
  const hostFn = holdem.match(/export async function hostTable\([\s\S]*?const name = `holdem-table-\$\{tableNumber\}`;/);
  assert.ok(hostFn, 'hostTable allocation snippet should exist');
  assert.doesNotMatch(hostFn[0], /interaction\.guild\.channels\.fetch\(/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS holdem_table_number_state/);
  assert.match(db, /export async function reserveHoldemTableNumber\(/);
  assert.match(adapter, /export const reserveHoldemTableNumber = pick\('reserveHoldemTableNumber'\);/);
});

test('vote reward DM delivery uses bounded concurrency workers', async () => {
  const content = await readRepoFile('src/index.mjs');
  assert.match(content, /const VOTE_REWARD_DM_CONCURRENCY =/);
  assert.match(content, /async function sendVoteRewardDm\(client, entry\)/);
  assert.match(content, /async function deliverVoteRewardDms\(client, entries, concurrency = VOTE_REWARD_DM_CONCURRENCY\)/);
  assert.match(content, /const workerCount = Math\.min\(Math\.max\(1, Number\(concurrency\) \|\| 1\), queue\.length\);/);
  assert.match(content, /await Promise\.all\(workers\);/);
  assert.match(content, /await deliverVoteRewardDms\(client, dmEntries\);/);
});

test('long-lived in-memory session maps enforce hard bounds', async () => {
  const session = await readRepoFile('src/games/session.mjs');
  const leaderboardSessions = await readRepoFile('src/lib/leaderboardSessions.mjs');
  assert.match(session, /export const ACTIVE_SESSION_MAP_MAX =/);
  assert.match(session, /function pruneActiveSessionsCapacity\(\)/);
  assert.match(session, /cleanupDetachedGameState\(key, session\?\.type\);/);
  assert.match(session, /pruneActiveSessionsCapacity\(\);/);
  assert.match(leaderboardSessions, /const MAX_SESSIONS =/);
  assert.match(leaderboardSessions, /function enforceSessionCapacity\(\)/);
  assert.match(leaderboardSessions, /enforceSessionCapacity\(\);/);
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

test('cartel worker uses paged active-investor reads and cached guild discovery', async () => {
  const service = await readRepoFile('src/cartel/service.mjs');
  const db = await readRepoFile('src/db/db.pg.mjs');
  const adapter = await readRepoFile('src/db/db.auto.mjs');
  assert.match(service, /CARTEL_WORKER_GUILD_CACHE_TTL_MS/);
  assert.match(service, /getCartelWorkerGuildIds\(/);
  assert.match(service, /getCartelActiveInvestorStats\(/);
  assert.match(service, /listCartelActiveInvestorsPage\(/);
  assert.match(service, /CARTEL_WORKER_INVESTOR_PAGE_SIZE/);
  assert.match(service, /CARTEL_WORKER_MAX_GUILD_CONCURRENCY/);
  assert.match(db, /export async function getCartelActiveInvestorStats\(/);
  assert.match(db, /export async function listCartelActiveInvestorsPage\(/);
  assert.match(adapter, /export const getCartelActiveInvestorStats = pick\('getCartelActiveInvestorStats'\);/);
  assert.match(adapter, /export const listCartelActiveInvestorsPage = pick\('listCartelActiveInvestorsPage'\);/);
});

test('cartel warehouse expiration is configurable and applied safely during production ticks', async () => {
  const constants = await readRepoFile('src/cartel/constants.mjs');
  const service = await readRepoFile('src/cartel/service.mjs');
  const todo = await readRepoFile('docs/TO-DO.md');
  assert.match(constants, /export const CARTEL_WAREHOUSE_EXPIRATION_ENABLED =/);
  assert.match(constants, /export const CARTEL_WAREHOUSE_EXPIRATION_CADENCE_SECONDS =/);
  assert.match(constants, /export const CARTEL_WAREHOUSE_EXPIRATION_GRAMS_PER_CADENCE =/);
  assert.match(service, /function calculateWarehouseExpirationMg\(warehouseMg, elapsedSeconds\)/);
  assert.match(service, /const expirationElapsedSeconds = lastTick \? Math\.max\(0, nowSeconds - lastTick\) : 0;/);
  assert.match(service, /const expiredMg = calculateWarehouseExpirationMg\(currentWarehouse, expirationElapsedSeconds\);/);
  assert.match(service, /const warehouseAfterExpiration = Math\.max\(0, currentWarehouse - expiredMg\);/);
  assert.match(service, /console\.info\('Cartel warehouse expiration applied'/);
  assert.match(todo, /\[x\] Add configurable expiration settings for warehouse Semuta/);
  assert.match(todo, /\[x\] Define expiration cadence \(per tick\/hour\/day\)\./);
  assert.match(todo, /\[x\] Apply expiration decay safely to warehouse Semuta\./);
  assert.match(todo, /\[x\] Log expiration amounts for balancing and debugging\./);
});

test('warehouse raid resolution is scoped per action and surfaced in user messaging', async () => {
  const service = await readRepoFile('src/cartel/service.mjs');
  const commands = await readRepoFile('src/commands/cartel.mjs');
  const db = await readRepoFile('src/db/db.pg.mjs');
  const adapter = await readRepoFile('src/db/db.auto.mjs');
  const todo = await readRepoFile('docs/TO-DO.md');
  assert.match(service, /async function resolveWarehouseRaidAfterAction\(guildId, userId, actionType, postInvestor, scope = \{\}, options = \{\}\)/);
  assert.match(service, /const scopeWarehouseMg = Math\.max\(0, Math\.floor\(Number\(scope\?\.warehouseMg \|\| 0\)\)\);/);
  assert.match(service, /const scopeCollectedMg = Math\.max\(0, Math\.floor\(Number\(scope\?\.collectedMg \|\| 0\)\)\);/);
  assert.match(service, /const raid = await runPreActionWarehouseRaidCheck\(guildId, userId, 'collect', \{ collectedMg: mgRequested \}\);/);
  assert.match(service, /const raid = await runPreActionWarehouseRaidCheck\(guildId, userId, 'burn', \{ burnMg: mgToBurn \}\);/);
  assert.match(service, /const raid = await runPreActionWarehouseRaidCheck\(guildId, userId, 'export', \{ exportMg: mgToExport \}\);/);
  assert.match(service, /const applied = await applyRaidOutcome\(guildId, userId, \{/);
  assert.match(db, /export async function cartelApplyRaidOutcome\(/);
  assert.match(db, /INSERT INTO cartel_transactions \(guild_id, user_id, type, amount_chips, amount_mg, metadata_json\)/);
  assert.match(adapter, /export const cartelApplyRaidOutcome = pick\('cartelApplyRaidOutcome'\);/);
  assert.match(service, /console\.info\('Cartel warehouse raid resolved', payload\);/);
  assert.match(commands, /function buildWarehouseRaidLines\(raid, chipsFmt\)/);
  assert.match(commands, /function buildWarehouseRaidFlavorEmbed\(interaction, raid, chipsFmt\)/);
  assert.match(commands, /name: 'Raided Player'/);
  assert.match(commands, /name: 'What Was Taken'/);
  assert.match(commands, /await postWarehouseRaidFlavorEmbed\(interaction, result\.raid, chipsFmt\);/);
  assert.match(commands, /const raidLines = buildWarehouseRaidLines\(result\.raid, chipsFmt\);/);
  assert.match(todo, /\[x\] Implement raid scope calculation per action type \(collect, burn, export\)\./);
  assert.match(todo, /\[x\] Apply confiscation and fine atomically in storage layer\./);
  assert.match(todo, /\- A raid check executes before one of these actions completes:/);
  assert.match(todo, /\[x\] Add raid trigger warning message: police are coming\./);
});

test('admin/mod queries are scoped by guild_id to prevent global reads', async () => {
  const content = await readRepoFile('src/db/db.pg.mjs');
  const getMods = content.match(/export async function getModerators\(guildId\)[\s\S]*?return rows\.map\(r => String\(r\.user_id\)\);/);
  const removeMods = content.match(/export async function removeModerator\(guildId, userId\)[\s\S]*?return getModerators\(guildId\);/);
  const getAdmins = content.match(/export async function getAdmins\(guildId\)[\s\S]*?return rows\.map\(r => String\(r\.user_id\)\);/);
  const removeAdmins = content.match(/export async function removeAdmin\(guildId, userId\)[\s\S]*?return getAdmins\(guildId\);/);
  assert.ok(getMods, 'getModerators should exist');
  assert.ok(removeMods, 'removeModerator should exist');
  assert.ok(getAdmins, 'getAdmins should exist');
  assert.ok(removeAdmins, 'removeAdmin should exist');
  assert.match(getMods[0], /WHERE guild_id = \$1/);
  assert.match(removeMods[0], /WHERE guild_id = \$1 AND user_id = \$2/);
  assert.match(getAdmins[0], /WHERE guild_id = \$1/);
  assert.match(removeAdmins[0], /WHERE guild_id = \$1 AND user_id = \$2/);
});

test('missing database indexes are created for cartel and access control tables', async () => {
  const content = await readRepoFile('src/db/db.pg.mjs');
  assert.match(content, /CREATE INDEX IF NOT EXISTS idx_mod_users_guild_user ON mod_users \(guild_id, user_id\)/);
  assert.match(content, /CREATE INDEX IF NOT EXISTS idx_admin_users_guild_user ON admin_users \(guild_id, user_id\)/);
  assert.match(content, /CREATE INDEX IF NOT EXISTS idx_cartel_investors_guild_shares ON cartel_investors \(guild_id, shares DESC\)/);
  assert.match(content, /CREATE INDEX IF NOT EXISTS idx_user_interaction_events_created ON user_interaction_events \(created_at ASC\)/);
  assert.match(content, /CREATE INDEX IF NOT EXISTS idx_users_guild_chips_created ON users \(guild_id, chips DESC, created_at ASC\)/);
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
  assert.match(content, /const GUILD_SETTINGS_CACHE_MAX =/);
  assert.match(content, /const ACCESS_LIST_CACHE_MAX =/);
  assert.match(content, /const USER_NEWS_STATE_MAX =/);
  assert.match(content, /function enforceMapCapacity\(map, maxSize\)/);
  assert.match(content, /enforceMapCapacity\(guildSettingsCache, GUILD_SETTINGS_CACHE_MAX\);/);
  assert.match(content, /enforceMapCapacity\(accessListCache, ACCESS_LIST_CACHE_MAX\);/);
  assert.match(content, /function setUserNewsState\(userId, state\)/);
  assert.match(content, /enforceMapCapacity\(userNewsState, USER_NEWS_STATE_MAX\);/);
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

test('todo list includes warehouse raid implementation checklist', async () => {
  const content = await readRepoFile('docs/TO-DO.md');
  assert.match(content, /# Warehouse Raid System Design \+ Implementation Checklist/);
  assert.match(content, /## 3\) Functional Requirements/);
  assert.match(content, /\[x\] Add configurable expiration settings for warehouse Semuta/);
  assert.match(content, /\[x\] Define expiration cadence \(per tick\/hour\/day\)\./);
  assert.match(content, /\[x\] Apply expiration decay safely to warehouse Semuta\./);
  assert.match(content, /\[x\] Log expiration amounts for balancing and debugging\./);
});

test('champion role sync avoids full guild member fetch on startup', async () => {
  const content = await readRepoFile('src/services/championRole.mjs');
  assert.doesNotMatch(content, /guild\.members\.fetch\(\)/);
  assert.match(content, /guild\.members\.fetch\(\{ user: topUserId, force: true \}\)/);
});

test('cartel raid debug command is admin-gated and wired through deploy and runtime handlers', async () => {
  const command = await readRepoFile('src/commands/cartelraiddebug.mjs');
  const service = await readRepoFile('src/cartel/service.mjs');
  const deploy = await readRepoFile('src/cli/deploy-commands.mjs');
  const index = await readRepoFile('src/index.mjs');
  const commandList = await readRepoFile('commands.json');

  assert.match(command, /if \(!\(await ctx\.isAdmin\(interaction\)\)\)/);
  assert.match(command, /triggerCartelRaidDebug\(/);
  assert.match(service, /export async function triggerCartelRaidDebug\(/);
  assert.match(service, /rollRaid: \(\) => \(\{/);
  assert.match(deploy, /name: 'cartelraiddebug'/);
  assert.match(deploy, /name: 'collected_grams'/);
  assert.match(index, /import cmdCartelRaidDebug from '\.\/commands\/cartelraiddebug\.mjs';/);
  assert.match(index, /cartelraiddebug: cmdCartelRaidDebug,/);
  assert.match(commandList, /"name": "cartelraiddebug"/);
});

test('cartel warehouse debug command is admin-gated and wired through deploy and runtime handlers', async () => {
  const command = await readRepoFile('src/commands/cartelwarehousedebug.mjs');
  const service = await readRepoFile('src/cartel/service.mjs');
  const deploy = await readRepoFile('src/cli/deploy-commands.mjs');
  const index = await readRepoFile('src/index.mjs');
  const commandList = await readRepoFile('commands.json');

  assert.match(command, /if \(!\(await ctx\.isAdmin\(interaction\)\)\)/);
  assert.match(command, /interaction\.options\.getNumber\('grams', true\)/);
  assert.match(command, /addCartelWarehouseDebug\(/);
  assert.match(service, /export async function addCartelWarehouseDebug\(/);
  assert.match(service, /recordCartelTransaction\(gid, uid, 'WAREHOUSE_DEBUG_ADD'/);
  assert.match(deploy, /name: 'cartelwarehousedebug'/);
  assert.match(deploy, /name: 'grams'/);
  assert.match(index, /import cmdCartelWarehouseDebug from '\.\/commands\/cartelwarehousedebug\.mjs';/);
  assert.match(index, /cartelwarehousedebug: cmdCartelWarehouseDebug,/);
  assert.match(commandList, /"name": "cartelwarehousedebug"/);
});

test('cartel overview and warehouse views include warehouse heat bar indicators', async () => {
  const command = await readRepoFile('src/commands/cartel.mjs');
  assert.match(command, /function buildHeatBar\(warehouseGrams\)/);
  assert.match(command, /function heatTierForWarehouse\(heat\)/);
  assert.match(command, /\$\{emoji\('warning'\)\} \$\{buildHeatBar\(metrics\.warehouseGrams\)\}/);
  assert.match(command, /CARTEL_WAREHOUSE_HEAT_PER_GRAM/);
  assert.match(command, /CARTEL_RAID_THRESHOLDS/);
});

test('dealer list view includes pause controls and routes pause actions', async () => {
  const command = await readRepoFile('src/commands/cartel.mjs');
  const service = await readRepoFile('src/cartel/service.mjs');
  const index = await readRepoFile('src/index.mjs');

  assert.match(command, /const CARTEL_DEALERS_PAUSE_PREFIX = 'cartel\|dealers\|pause\|dealer\|';/);
  assert.match(command, /const CARTEL_DEALERS_PAUSE_ALL_ID = 'cartel\|dealers\|pause_all';/);
  assert.match(command, /function buildDealerPauseRows\(dealers\)/);
  assert.match(command, /function buildDealerPauseAllRow\(dealers\)/);
  assert.match(command, /\.setCustomId\(CARTEL_DEALERS_PAUSE_ALL_ID\)/);
  assert.match(command, /\.setCustomId\(`\$\{CARTEL_DEALERS_PAUSE_PREFIX\}\$\{dealer\.dealer_id\}`\)/);
  assert.match(command, /export async function handleCartelDealerPause\(/);
  assert.match(command, /export async function handleCartelDealerPauseAll\(/);

  assert.match(service, /export async function pauseCartelDealer\(/);
  assert.match(service, /export async function pauseAllCartelDealers\(/);
  assert.match(service, /recordCartelTransaction\(guildId, userId, 'DEALER_PAUSE'/);
  assert.match(service, /recordCartelTransaction\(guildId, userId, 'DEALER_PAUSE_ALL'/);

  assert.match(index, /handleCartelDealerPause,/);
  assert.match(index, /handleCartelDealerPauseAll,/);
  assert.match(index, /interaction\.customId === 'cartel\|dealers\|pause_all'/);
  assert.match(index, /interaction\.customId\.startsWith\('cartel\|dealers\|pause\|dealer\|'/);
});
