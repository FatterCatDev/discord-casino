import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Events } from 'discord.js';
import { registerRuntime } from '../src/runtime/application.mjs';
import { createBackgroundTasks } from '../src/runtime/background.mjs';
import { createOrphanCleanup } from '../src/runtime/orphan-cleanup.mjs';
import { registerGuildEvents } from '../src/runtime/events.mjs';
import { invalidateGuildSettingsCache } from '../src/runtime/caches.mjs';
import { holdemTables } from '../src/games/holdem.mjs';
import { databaseFakes, databaseCalls, resetDatabaseFakes } from './support/database.mjs';

const flush = () => new Promise(setImmediate);

function clock(t) {
  const intervals = new Map();
  const timeouts = new Map();
  const add = map => (callback, delay) => {
    const timer = { callback, delay, unref() {} };
    map.set(timer, timer);
    return timer;
  };
  t.mock.method(globalThis, 'setInterval', add(intervals));
  t.mock.method(globalThis, 'clearInterval', timer => intervals.delete(timer));
  t.mock.method(globalThis, 'setTimeout', add(timeouts));
  t.mock.method(globalThis, 'clearTimeout', timer => timeouts.delete(timer));
  return { intervals, timeouts };
}

function fakeClient() {
  const client = new EventEmitter();
  client.user = { tag: 'offline-test' };
  client.isReady = () => true;
  client.guilds = { cache: new Map() };
  return client;
}

test('runtime lifecycle: registration is single-start and disposal removes only owned listeners', t => {
  const client = fakeClient();
  const existing = () => {};
  client.on(Events.InteractionCreate, existing);
  const rejections = process.listenerCount('unhandledRejection');
  const exceptions = process.listenerCount('uncaughtException');
  const runtime = registerRuntime(client);
  t.after(() => runtime.dispose());
  assert.equal(registerRuntime(client), runtime);
  assert.equal(client.listenerCount(Events.ClientReady), 1);
  assert.equal(client.listenerCount(Events.InteractionCreate), 2);
  assert.equal(process.listenerCount('unhandledRejection'), rejections + 1);
  assert.equal(process.listenerCount('uncaughtException'), exceptions + 1);
  runtime.dispose();
  runtime.dispose();
  assert.deepEqual(client.listeners(Events.InteractionCreate), [existing]);
  assert.equal(client.listenerCount(Events.ClientReady), 0);
  for (const event of [Events.GuildCreate, Events.GuildDelete, Events.MessageCreate, Events.GuildAuditLogEntryCreate]) {
    assert.equal(client.listenerCount(event), 0);
  }
  assert.equal(process.listenerCount('unhandledRejection'), rejections);
  assert.equal(process.listenerCount('uncaughtException'), exceptions);
  assert.equal(registerRuntime(client), runtime, 'a disposed registration cannot accidentally restart');
});

test('runtime lifecycle: ready starts each timer once, vote sweeps do not overlap, and disposal clears workers', async t => {
  const { intervals } = clock(t);
  t.after(resetDatabaseFakes);
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args));
  t.mock.method(console, 'log', () => {});
  databaseFakes.set('getGlobalPlayerCount', async () => 12);
  databaseFakes.set('setBotStatusSnapshot', async () => {});
  databaseFakes.set('listUsersToMarkInactive', async () => []);
  databaseFakes.set('listCartelGuildIds', async () => []);
  databaseFakes.set('pruneUserInteractionEvents', async () => 0);
  let finishVotes;
  let sweeps = 0;
  databaseFakes.set('listUsersWithPendingVoteRewards', () => {
    sweeps += 1;
    return new Promise(resolve => { finishVotes = resolve; });
  });
  let orphanSchedules = 0;
  const client = fakeClient();
  const background = createBackgroundTasks(client, () => { orphanSchedules += 1; });
  t.after(() => background.dispose());
  background.startBackgroundTasks(client);
  const count = intervals.size;
  background.startBackgroundTasks(client);
  assert.equal(intervals.size, count);
  assert.equal(count, 6, 'status, sessions, votes, prune, inactivity, and Cartel timers');
  assert.equal(orphanSchedules, 1);
  assert.equal(sweeps, 1);
  assert.deepEqual([...intervals.values()].slice(0, 4).map(timer => timer.delay), [120_000, 15_000, 15_000, 900_000]);
  // Both session and vote intervals use 15 seconds; exercise every owned interval.
  for (const timer of intervals.values()) timer.callback();
  assert.equal(sweeps, 1, 'the pending vote sweep holds its in-flight lock');
  finishVotes([]);
  await flush();
  for (const timer of intervals.values()) timer.callback();
  assert.equal(sweeps, 2);
  finishVotes([]);
  await flush();
  const snapshots = databaseCalls.filter(call => call.name === 'setBotStatusSnapshot');
  assert.deepEqual(snapshots[0].args, [{ guildCount: 0, playerCount: 12 }]);
  const staleCallbacks = [...intervals.values()].map(timer => timer.callback);
  background.dispose();
  assert.equal(intervals.size, 0);
  const calls = databaseCalls.length;
  // Runtime-owned callbacks guard disposal, including callbacks already queued at shutdown.
  for (const callback of staleCallbacks.slice(0, 4)) callback();
  await flush();
  assert.equal(databaseCalls.length, calls);
  background.startBackgroundTasks(client);
  assert.equal(intervals.size, 0);
  assert.deepEqual(errors, []);
});

test('runtime lifecycle: snapshots skip unready clients', async t => {
  t.after(resetDatabaseFakes);
  const client = fakeClient();
  client.isReady = () => false;
  const background = createBackgroundTasks(client, () => {});
  await background.pushBotStatusSnapshot('test');
  assert.equal(databaseCalls.length, 0);
  background.dispose();
});

test('runtime lifecycle: orphan cleanup delays and batches guilds, refunds before deleting, and skips live tables', async t => {
  const { timeouts } = clock(t);
  const order = [];
  t.after(resetDatabaseFakes);
  const guildIds = ['orphans-a', 'orphans-b', 'orphans-c'];
  for (const id of guildIds) invalidateGuildSettingsCache(id);
  t.after(() => guildIds.forEach(invalidateGuildSettingsCache));
  databaseFakes.set('getGuildSettings', async () => ({ casino_category_id: 'casino' }));
  databaseFakes.set('listEscrowForTable', async id => { order.push(`escrow:${id}`); return [{ user_id: 'user', balance: 30 }]; });
  databaseFakes.set('escrowReturn', async id => order.push(`refund:${id}`));
  const channel = (id, name = 'holdem-table-1', parentId = 'casino') => ({
    id, name, parentId, deletable: true, isTextBased: () => true,
    delete: async () => order.push(`delete:${id}`)
  });
  const client = fakeClient();
  client.guilds.cache = new Map(guildIds.map(id => [id, {}]));
  client.guilds.fetch = async id => ({
    channels: { fetch: async () => new Map([
      ['orphan', channel(id)],
      ['live', channel('live')],
      ['other-category', channel('wrong-parent', 'holdem-table-2', 'elsewhere')],
      ['other-name', channel('wrong-name', 'general')]
    ]) }
  });
  const registryKey = 'runtime-orphan-test';
  holdemTables.set(registryKey, { channelId: 'live' });
  t.after(() => holdemTables.delete(registryKey));
  const cleanup = createOrphanCleanup();
  t.after(() => cleanup.dispose());
  cleanup.scheduleStartupHoldemOrphanSweep(client);
  cleanup.scheduleStartupHoldemOrphanSweep(client);
  assert.equal(timeouts.size, 1);
  assert.equal(databaseCalls.length, 0);
  let timer = [...timeouts.values()][0];
  assert.equal(timer.delay, 20_000);
  timeouts.delete(timer);
  timer.callback();
  await flush();
  assert.equal(order.filter(value => value.startsWith('delete:')).length, 2);
  timer = [...timeouts.values()][0];
  assert.equal(timer.delay, 1_500);
  timeouts.delete(timer);
  timer.callback();
  await flush();
  assert.equal(timeouts.size, 0);
  for (const id of guildIds) {
    assert.ok(order.indexOf(`escrow:${id}`) < order.indexOf(`refund:${id}`));
    assert.ok(order.indexOf(`refund:${id}`) < order.indexOf(`delete:${id}`));
  }
  assert.equal(order.some(value => /live|wrong-/.test(value)), false);
});

test('runtime lifecycle: disposing an in-flight orphan batch prevents deletion and rescheduling', async t => {
  const { timeouts } = clock(t);
  t.after(resetDatabaseFakes);
  const guildId = 'orphans-disposed';
  t.after(() => invalidateGuildSettingsCache(guildId));
  databaseFakes.set('getGuildSettings', async () => ({ casino_category_id: 'casino' }));
  let finishEscrow;
  databaseFakes.set('listEscrowForTable', () => new Promise(resolve => { finishEscrow = resolve; }));
  const client = fakeClient();
  client.guilds.cache = new Map([[guildId, {}], ['unused-b', {}], ['unused-c', {}]]);
  client.guilds.fetch = async () => ({
    channels: { fetch: async () => new Map([['orphan', {
      id: 'orphan', name: 'holdem-table-1', parentId: 'casino', isTextBased: () => true,
      deletable: true, delete: () => assert.fail('disposed sweep must not delete')
    }]]) }
  });
  // Only the first guild has a category so the second batch member completes immediately.
  databaseFakes.set('getGuildSettings', async id => id === guildId ? { casino_category_id: 'casino' } : {});
  const cleanup = createOrphanCleanup();
  t.after(() => { cleanup.dispose(); invalidateGuildSettingsCache('unused-b'); });
  cleanup.scheduleStartupHoldemOrphanSweep(client);
  const timer = [...timeouts.values()][0];
  timeouts.delete(timer);
  timer.callback();
  await flush();
  assert.equal(typeof finishEscrow, 'function');
  cleanup.dispose();
  finishEscrow([]);
  await flush();
  assert.equal(timeouts.size, 0);
  cleanup.scheduleStartupHoldemOrphanSweep(client);
  assert.equal(timeouts.size, 0);
});

test('runtime lifecycle: old guild-create events keep their early return; delete events refresh listings', async t => {
  const client = fakeClient();
  const reasons = [];
  const dispose = registerGuildEvents(
    client, async reason => reasons.push(`snapshot:${reason}`),
    reason => reasons.push(`topgg:${reason}`),
    reason => reasons.push(`forge:${reason}`)
  );
  t.after(dispose);
  await client.listeners(Events.GuildCreate)[0]({ id: 'old', joinedTimestamp: Date.now() - 86_400_000 });
  assert.deepEqual(reasons, []);
  client.emit(Events.GuildDelete, {});
  assert.deepEqual(reasons, ['snapshot:guild_delete', 'topgg:guild_delete', 'forge:guild_delete']);
});
