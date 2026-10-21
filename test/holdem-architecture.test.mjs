import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { holdemTables as publicTables } from '../src/games/holdem.mjs';
import { holdemTables as ownedTables } from '../src/games/holdem/state.mjs';
import handleButtons from '../src/interactions/holdemButtons.mjs';
import handleBet from '../src/interactions/holdemBetModal.mjs';
import handleJoin from '../src/interactions/holdemJoinModal.mjs';
import handleCustom from '../src/interactions/holdemCustomModal.mjs';

const directory = new URL('../src/games/holdem/', import.meta.url);

async function moduleImports() {
  const files = (await readdir(directory)).filter(name => name.endsWith('.mjs'));
  return new Map(await Promise.all(files.map(async file => {
    const source = await readFile(new URL(file, directory), 'utf8');
    const imports = [...source.matchAll(/(?:import|export)\s+[^;]*?\bfrom\s+['"]([^'"]+)['"]/g)]
      .map(match => match[1]);
    return [file, imports];
  })));
}

test('holdem architecture: internal imports are acyclic and never point back at the facade', async () => {
  const graph = await moduleImports();
  function visit(file, ancestors = []) {
    assert.ok(!ancestors.includes(file), `Circular dependency: ${[...ancestors, file].join(' -> ')}`);
    for (const dependency of graph.get(file)) {
      assert.notEqual(dependency, '../holdem.mjs', `${file} must not import its facade`);
      if (!dependency.startsWith('./')) continue;
      const child = dependency.slice(2);
      assert.ok(graph.has(child), `Missing module ${dependency} in ${file}`);
      visit(child, [...ancestors, file]);
    }
  }
  for (const file of graph.keys()) visit(file);
  assert.equal(publicTables, ownedTables);
});

test('holdem architecture: rules have no Discord, database, settings, or timer dependencies', async () => {
  const graph = await moduleImports();
  const allowed = new Set([
    'node:crypto', './deck.mjs', './evaluation.mjs', './pots.mjs', './betting.mjs', './state.mjs'
  ]);
  for (const file of ['state.mjs', 'deck.mjs', 'evaluation.mjs', 'betting.mjs', 'pots.mjs']) {
    for (const dependency of graph.get(file)) {
      assert.ok(allowed.has(dependency), `Unexpected pure-module dependency: ${file} -> ${dependency}`);
    }
    const source = await readFile(new URL(file, directory), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    assert.doesNotMatch(code, /\b(?:setTimeout|setInterval|fetch)\s*\(|process\.env|import\s*\(/);
  }
});

test('holdem architecture: all four existing interaction adapters remain executable', async () => {
  const replies = [];
  const request = {
    guild: { id: 'absent-guild' }, channelId: 'absent-channel',
    user: { id: 'visitor' },
    reply: async payload => { replies.push(payload); return payload; }
  };
  await handleButtons({ ...request, customId: 'hold|peek' }, {});
  await handleBet({ ...request, customId: 'hold|bet|visitor' }, {});
  await handleJoin({ ...request, customId: 'hold|join|visitor' }, {});
  await handleCustom({ ...request, customId: 'hold|custom|someone-else|source' }, {});
  assert.equal(replies.length, 4);
  assert.ok(replies.every(payload => payload.ephemeral === true));
  assert.ok(replies.slice(0, 3).every(payload => /No table here/.test(payload.content)));
  assert.match(replies[3].content, /not for you/);
});
