import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags } from 'discord.js';
import {
  getGuildSettingsCached, invalidateGuildSettingsCache, invalidateAccessCache, getAccessListCached
} from '../src/runtime/caches.mjs';
import { hasAdminAccess, hasModeratorAccess } from '../src/runtime/access.mjs';
import { createCommandContext } from '../src/runtime/context.mjs';
import { normalizeEphemeralOption, patchInteractionResponseMethods } from '../src/runtime/responses.mjs';
import { deliverVoteRewardDms } from '../src/runtime/vote-delivery.mjs';
import { setTimedCache, getTimedCache, enforceMapCapacity } from '../src/runtime/cache-primitives.mjs';
import { toBool, toMinInt } from '../src/runtime/config.mjs';
import { databaseFakes, databaseCalls, resetDatabaseFakes } from './support/database.mjs';

test('runtime: configuration parsing retains boolean aliases and numeric bounds', () => {
  assert.equal(toBool(undefined), true);
  for (const value of ['false', '0', 'NO', 'off']) assert.equal(toBool(value), false);
  for (const value of ['true', '1', 'YES', 'on']) assert.equal(toBool(value), true);
  assert.equal(toBool('invalid', false), false);
  assert.equal(toMinInt('invalid', 30, 1), 30);
  assert.equal(toMinInt('-10', 30, 1), 1);
  assert.equal(toMinInt('12.9', 30, 1), 12);
});

test('runtime: timed cache expires on the boundary and evicts least recently used entries', t => {
  let now = 100;
  t.mock.method(Date, 'now', () => now);
  const map = new Map();
  setTimedCache(map, 'a', { value: 1 }, 10);
  setTimedCache(map, 'b', { value: 2 }, 10);
  assert.deepEqual(getTimedCache(map, 'a'), { value: 1 });
  setTimedCache(map, 'c', { value: 3 }, 10);
  enforceMapCapacity(map, 2);
  assert.deepEqual([...map.keys()], ['a', 'c']);
  now = 110;
  assert.equal(getTimedCache(map, 'a'), null);
  assert.equal(map.has('a'), false);
});

test('runtime: guild settings cache preserves identity until invalidation or expiry', async t => {
  t.after(resetDatabaseFakes);
  let now = 100;
  t.mock.method(Date, 'now', () => now);
  const guildId = 'runtime-settings';
  invalidateGuildSettingsCache(guildId);
  t.after(() => invalidateGuildSettingsCache(guildId));
  databaseFakes.set('getGuildSettings', async () => ({ sequence: databaseCalls.length }));
  const first = await getGuildSettingsCached(guildId);
  assert.equal(await getGuildSettingsCached(guildId), first);
  assert.equal(databaseCalls.length, 1);
  now += 45_000;
  assert.notEqual(await getGuildSettingsCached(guildId), first);
  invalidateGuildSettingsCache(guildId);
  await getGuildSettingsCached(guildId);
  assert.equal(databaseCalls.length, 3);
  assert.equal(await getGuildSettingsCached(null), null);
});

test('runtime: access lists normalize IDs, remain guild-scoped, and invalidate both roles', async t => {
  t.after(resetDatabaseFakes);
  const guildId = 'runtime-access';
  invalidateAccessCache(guildId);
  t.after(() => invalidateAccessCache(guildId));
  let loads = 0;
  const loader = async () => { loads++; return [123, '123', 'other']; };
  assert.deepEqual(await getAccessListCached(guildId, 'admins', loader), ['123', 'other']);
  await getAccessListCached(guildId, 'admins', loader);
  assert.equal(loads, 1);
  invalidateAccessCache(guildId);
  databaseFakes.set('getAdmins', async () => ['admin']);
  databaseFakes.set('getModerators', async () => ['moderator']);
  assert.equal(await hasAdminAccess(guildId, 'admin'), true);
  assert.equal(await hasAdminAccess(guildId, 'moderator'), false);
  assert.equal(await hasModeratorAccess(guildId, 'admin'), true);
  assert.equal(await hasModeratorAccess(guildId, 'moderator'), true);
  assert.equal(await hasModeratorAccess(guildId, 'visitor'), false);
  assert.equal(await hasAdminAccess(guildId, null), false);
});

test('runtime: command context binds database calls to the guild and awaits session cleanup', async t => {
  t.after(resetDatabaseFakes);
  databaseFakes.set('getUserBalances', async (...args) => args);
  const client = {};
  const buildCommandContext = createCommandContext(client);
  let release;
  const sessionCleanupPromise = new Promise(resolve => { release = resolve; });
  const ctx = buildCommandContext({ guild: { id: 'context-guild' }, client }, {
    kittenMode: false, sessionCleanupPromise
  });
  assert.deepEqual(await ctx.getUserBalances('player'), ['context-guild', 'player']);
  assert.equal(ctx.guildId, 'context-guild');
  assert.equal(await ctx.isKittenModeEnabled(), false);
  const payload = { content: 'hello' };
  assert.equal(ctx.kittenizePayload(payload), payload);
  let completed = false;
  const waiting = ctx.awaitSessionCleanup().then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false);
  release();
  await waiting;
  assert.equal(completed, true);
});

test('runtime: response normalization is non-mutating and wrapping is idempotent', async () => {
  const payload = { content: 'hello', ephemeral: true, flags: 4 };
  assert.deepEqual(normalizeEphemeralOption(payload), {
    content: 'hello', flags: 4 | MessageFlags.Ephemeral
  });
  assert.equal(payload.ephemeral, true);
  assert.equal(normalizeEphemeralOption('plain'), 'plain');
  const replies = [];
  const request = { reply: async value => { replies.push(value); } };
  patchInteractionResponseMethods(request);
  const wrapped = request.reply;
  patchInteractionResponseMethods(request);
  assert.equal(request.reply, wrapped);
  await request.reply(payload);
  assert.equal(replies[0].ephemeral, undefined);
  assert.equal(replies[0].flags, 4 | MessageFlags.Ephemeral);
});

test('runtime: vote reward delivery respects concurrency and persists each outcome', async t => {
  t.after(resetDatabaseFakes);
  t.mock.method(console, 'error', () => {});
  databaseFakes.set('markVoteRewardDmStatus', async () => {});
  let running = 0;
  let peak = 0;
  const sent = [];
  const fakeClient = { users: { fetch: async userId => ({
    send: async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise(resolve => setImmediate(resolve));
      running--;
      if (userId === 'u2') throw new Error('DM blocked');
      sent.push(userId);
    }
  }) } };
  const entries = Array.from({ length: 5 }, (_, index) => ({
    userId: `u${index}`, claimedTotal: 100, claimedRewards: [{ id: index + 1 }]
  }));
  await deliverVoteRewardDms(fakeClient, entries, 2);
  assert.equal(peak, 2);
  assert.equal(sent.length, 4);
  assert.equal(databaseCalls.length, 5);
  const statuses = databaseCalls.map(call => ({ id: call.args[0][0], sent: call.args[1].sent }));
  assert.deepEqual(statuses.sort((a, b) => a.id - b.id), [
    { id: 1, sent: true }, { id: 2, sent: true }, { id: 3, sent: false },
    { id: 4, sent: true }, { id: 5, sent: true }
  ]);
});
