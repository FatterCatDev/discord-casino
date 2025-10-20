import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';

let Client;
try { ({ Client } = await import('pg')); }
catch { console.error('Missing dependency: pg. Run `npm install pg`'); process.exit(1); }

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is not set. Export it or add to .env'); process.exit(1); }

const ssl = buildSslConfig();

const sqlPath = new URL('../scripts/pg-schema.sql', import.meta.url);
const sql = readFileSync(sqlPath, 'utf8');

const client = new Client({ connectionString: url, ssl });

async function main() {
  try {
    await client.connect();
    await client.query(sql);
    console.log('Migration applied successfully.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    try { await client.end(); } catch {}
  }
}

main();

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
