import { readFile } from 'node:fs/promises';

const adapterUrl = new URL('../../src/db/db.auto.mjs', import.meta.url).href;
const driverUrl = new URL('../../src/db/db.pg.mjs', import.meta.url).href;
const fakeDatabaseUrl = new URL('./database.mjs', import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'pg' || specifier.startsWith('pg/') ||
      specifier === 'dotenv' || specifier.startsWith('dotenv/')) {
    throw new Error(`Runtime dependency ${specifier} is disabled in isolated tests.`);
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url === driverUrl) {
    throw new Error('Direct Postgres imports are disabled in isolated tests.');
  }
  if (url === adapterUrl) {
    const source = await readFile(new URL(url), 'utf8');
    const names = [...source.matchAll(/^export (?:const|(?:async )?function) (\w+)/gm)]
      .map(match => match[1]);
    if (names.length === 0) throw new Error('No database adapter exports found.');
    const exports = names.map(name => name === '__DB_DRIVER'
      ? "export const __DB_DRIVER = 'isolated-test';"
      : `export const ${name} = (...args) => invokeDatabase('${name}', args);`);
    return {
      format: 'module',
      shortCircuit: true,
      source: `import { invokeDatabase } from '${fakeDatabaseUrl}';\n${exports.join('\n')}`
    };
  }
  return nextLoad(url, context);
}
