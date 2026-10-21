import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import { getUserBalances, __DB_DRIVER } from '../src/db/db.auto.mjs';
import { databaseFakes, resetDatabaseFakes } from './support/database.mjs';

test('isolation: runtime settings are absent and dotenv/Postgres imports fail closed', async () => {
  assert.equal(process.env.DATABASE_URL, undefined);
  assert.equal(process.env.DISCORD_TOKEN, undefined);
  assert.equal(process.env.EMOJI_MAP_PATH, undefined);
  assert.equal(__DB_DRIVER, 'isolated-test');
  await assert.rejects(import('dotenv/config'), /disabled in isolated tests/);
  await assert.rejects(import('pg'), /disabled in isolated tests/);
  await assert.rejects(import('../src/db/db.pg.mjs'), /Postgres imports are disabled/);
});

test('isolation: unconfigured database calls throw instead of returning success', t => {
  t.after(resetDatabaseFakes);
  assert.throws(() => getUserBalances('guild', 'user'), /Unexpected database call: getUserBalances/);
  databaseFakes.set('getUserBalances', (guildId, userId) => ({ guildId, userId, chips: 12 }));
  assert.deepEqual(getUserBalances('guild', 'user'), { guildId: 'guild', userId: 'user', chips: 12 });
});

test('isolation: fetch, TCP, TLS, and HTTP transports cannot open connections', () => {
  for (const attempt of [
    () => fetch('https://example.invalid'),
    () => net.connect({ host: '127.0.0.1', port: 5432 }),
    () => tls.connect({ host: '127.0.0.1', port: 443 }),
    () => http.request('http://example.invalid'),
    () => http.get('http://example.invalid'),
    () => https.request('https://example.invalid'),
    () => https.get('https://example.invalid')
  ]) {
    assert.throws(attempt, /Network access is disabled/);
  }
});
