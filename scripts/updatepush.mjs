#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, GatewayIntentBits } from 'discord.js';
import { pushUpdateAnnouncement } from '../src/services/updates.mjs';
import pkg from '../package.json' with { type: 'json' };
import { setUpdateChannel } from '../src/db/db.auto.mjs';
import { emoji } from '../src/lib/emojis.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const UPDATE_PATH = path.join(ROOT, 'UPDATE.md');

function parseUpdateFile(text) {
  const lines = text.split(/\r?\n/);
  let version = null;
  const changes = [];
  const details = [];
  let section = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const lower = line.toLowerCase();
    if (lower.startsWith('version:')) {
      const value = line.split(':').slice(1).join(':');
      if (value) version = value.trim();
      continue;
    }

    if (lower === '## details') {
      section = 'details';
      continue;
    }
    if (lower === '## changes') {
      section = 'changes';
      continue;
    }

    if (section === 'details') {
      details.push(raw);
      continue;
    }
    if (section === 'changes') {
      if (line.startsWith('-') || line.startsWith('*')) {
        const entry = line.replace(/^[-*]\s*/, '').trim();
        if (entry) changes.push(entry);
      }
      continue;
    }
  }

  return { version, changes, details };
}

const INSTALL_LINK = 'https://top.gg/bot/1415454565687492780';

function appendInstallLink(content) {
  if (!content || content.includes(INSTALL_LINK)) return content;
  const separator = content.endsWith('\n') ? '' : '\n\n';
  return `${content}${separator}${emoji('link')} Invite the bot: ${INSTALL_LINK}`;
}

function bumpPatch(version) {
  const match = version?.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new Error(`Unrecognized version format: ${version}`);
  const [, majorStr, minorStr, patchStr] = match;
  const major = Number(majorStr);
  const minor = Number(minorStr);
  const patch = Number(patchStr);
  return `${major}.${minor}.${patch + 1}`;
}

function resolveGuildIds() {
  const raw = process.env.UPDATE_GUILD_IDS || process.env.PRIMARY_GUILD_ID || process.env.GUILD_ID || '';
  const ids = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (!ids.length) throw new Error('No guild IDs resolved. Set UPDATE_GUILD_IDS or PRIMARY_GUILD_ID.');
  return ids;
}

const UPDATE_CHANNEL_ID = process.env.UPDATE_CHANNEL_ID || '1426730736312123466';

async function main() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN is required to push update announcements.');

  const fileText = await fs.readFile(UPDATE_PATH, 'utf8').catch(err => {
    if (err.code === 'ENOENT') {
      throw new Error('UPDATE.md not found. Create the file before running updatepush.');
    }
    throw err;
  });

  const trimmed = fileText.trimEnd();
  const { version: fileVersion, changes } = parseUpdateFile(fileText);
  const currentVersion = fileVersion || pkg.version;
  if (!currentVersion) throw new Error('Unable to determine current version from UPDATE.md or package.json.');
  if (!changes.length) throw new Error('No changes listed in UPDATE.md. Add bullet points before running updatepush.');

  const guildIds = resolveGuildIds();
  const releaseTimestamp = new Date().toISOString();

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);

  const failures = [];
  let successCount = 0;
  for (const guildId of guildIds) {
    try {
      if (UPDATE_CHANNEL_ID) {
        try {
          await setUpdateChannel(guildId, UPDATE_CHANNEL_ID);
        } catch (err) {
          console.warn(`Warning: could not set update channel for guild ${guildId}:`, err?.message || err);
        }
      }
      await pushUpdateAnnouncement(client, guildId, {
        content: appendInstallLink(trimmed),
        mentionEveryone: true
      });
      console.log(`Update announcement sent for guild ${guildId}`);
      successCount += 1;
    } catch (err) {
      if (err?.message === 'UPDATE_CHANNEL_NOT_CONFIGURED') {
        console.warn(`Skipping guild ${guildId}: no update channel set (use /setupdatech).`);
        continue;
      }
      failures.push({ guildId, error: err });
      const details = err?.rawError || err?.cause || err;
      console.error(`Failed to push update for guild ${guildId}:`, err?.message || err);
      if (details && details !== err) {
        console.error('Additional error info:', details);
      }
    }
  }

  await client.destroy();

  if (successCount === 0) {
    console.error('No guilds received the update announcement. Configure an update channel with /setupdatech and try again.');
    throw new Error('Update push aborted: no eligible guilds.');
  }

  if (failures.length) {
    console.warn('Some guilds did not receive the announcement. Resolve the errors above and re-run updatepush if needed.');
  }

  const nextVersion = bumpPatch(currentVersion);

  const newUpdateContent = `# Pending Update\n\nversion: ${nextVersion}\n\n## Changes\n\n<!-- Add one bullet per noteworthy change below. Example: - Improved chip payout handling -->\n\n`;
  await fs.writeFile(UPDATE_PATH, newUpdateContent, 'utf8');

  const newPkg = { ...pkg, version: nextVersion };
  await fs.writeFile(path.join(ROOT, 'package.json'), `${JSON.stringify(newPkg, null, 2)}\n`, 'utf8');

  console.log(`Version bumped to ${nextVersion} and UPDATE.md reset.`);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
