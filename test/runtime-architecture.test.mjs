import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Client } from 'discord.js';

const directory = new URL('../src/runtime/', import.meta.url);

test('runtime architecture: module graph is acyclic and never imports the entry point', async () => {
  const files = (await readdir(directory)).filter(name => name.endsWith('.mjs'));
  const graph = new Map(await Promise.all(files.map(async file => {
    const source = await readFile(new URL(file, directory), 'utf8');
    const dependencies = [...source.matchAll(/(?:import|export)\s+[^;]*?\bfrom\s+['"]([^'"]+)['"]/g)]
      .map(match => match[1]);
    return [file, dependencies];
  })));
  const done = new Set();
  function visit(file, ancestors = []) {
    assert.ok(!ancestors.includes(file), `Circular runtime dependency: ${[...ancestors, file].join(' -> ')}`);
    if (done.has(file)) return;
    for (const dependency of graph.get(file)) {
      assert.notEqual(dependency, '../index.mjs');
      assert.notEqual(dependency, 'dotenv/config');
      if (!dependency.startsWith('./')) continue;
      const child = dependency.slice(2);
      assert.ok(graph.has(child), `Missing runtime module: ${file} -> ${child}`);
      visit(child, [...ancestors, file]);
    }
    done.add(file);
  }
  for (const file of files) visit(file);
  const entry = await readFile(new URL('../src/index.mjs', import.meta.url), 'utf8');
  assert.ok(entry.split('\n').length <= 40, 'entry point should remain a small composition root');
  assert.match(entry, /registerRuntime\(client\)/);
  assert.match(entry, /client\.login\(process\.env\.DISCORD_TOKEN\)/);
  assert.doesNotMatch(entry, /setInterval\(|setTimeout\(|client\.on\(/);
});

test('runtime architecture: imports do not log in, register process handlers, or start timers', async t => {
  t.mock.method(Client.prototype, 'login', () => assert.fail('runtime imports must not log in'));
  t.mock.method(globalThis, 'setInterval', () => assert.fail('runtime imports must not start intervals'));
  t.mock.method(globalThis, 'setTimeout', () => assert.fail('runtime imports must not start timeouts'));
  const before = {
    rejections: process.listeners('unhandledRejection'),
    exceptions: process.listeners('uncaughtException')
  };
  const files = (await readdir(directory)).filter(name => name.endsWith('.mjs'));
  await Promise.all(files.map(file => import(new URL(file, directory))));
  assert.deepEqual(process.listeners('unhandledRejection'), before.rejections);
  assert.deepEqual(process.listeners('uncaughtException'), before.exceptions);
});
