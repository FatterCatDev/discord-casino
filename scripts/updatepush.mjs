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
const README_PATH = path.join(ROOT, 'README.md');
const STATUS_HEADING_REGEX = /^#\s*(?:pending\s+update|update)\b.*$/im;
const UPDATE_ROLE_ID = '1426725492538478593';
const DEFAULT_HOME_GUILD_ID = '1200629872423346246';
const DEFAULT_UPDATE_CHANNEL_ID = '1426730736312123466';

function setUpdateStatus(content, status) {
  if (status !== 'pending' && status !== 'update') {
    throw new Error(`Unsupported update status: ${status}`);
  }
  const heading = status === 'pending' ? '# Pending Update' : '# Update';
  const match = content.match(STATUS_HEADING_REGEX);
  if (match) {
    return content.replace(STATUS_HEADING_REGEX, heading);
  }
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const trimmed = content.replace(/^\s+/, '');
  return `${heading}${eol}${eol}${trimmed}`;
}

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

const BOT_HOME_URL = 'https://semutacasino.com/';

function appendInstallLink(content) {
  if (!content || content.includes(BOT_HOME_URL)) return content;
  const separator = content.endsWith('\n') ? '' : '\n\n';
  return `${content}${separator}${emoji('link')} Home page: ${BOT_HOME_URL}`;
}

function stripHtmlComments(text) {
  if (!text) return text;
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

async function recordLastUpdateVersion(version) {
  try {
    const readme = await fs.readFile(README_PATH, 'utf8');
    const marker = /^Last update:\s*.*$/m;
    let updated;
    if (marker.test(readme)) {
      updated = readme.replace(marker, `Last update: ${version}`);
    } else {
      const lines = readme.split(/\r?\n/);
      const titleIndex = lines.findIndex(line => line.startsWith('# '));
      if (titleIndex !== -1) {
        lines.splice(titleIndex + 1, 0, `Last update: ${version}`, '');
      } else {
        lines.unshift(`Last update: ${version}`, '');
      }
      updated = lines.join('\n');
    }
    if (updated !== readme) {
      await fs.writeFile(README_PATH, updated, 'utf8');
    }
  } catch (err) {
    console.warn('Could not write last update version to README:', err?.message || err);
  }
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

function normalizeSnowflake(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const match = raw.match(/(\d{5,})/);
  return match ? match[1] : null;
}

function resolveGuildIds() {
  const raw = process.env.UPDATE_GUILD_IDS || process.env.PRIMARY_GUILD_ID || process.env.GUILD_ID || DEFAULT_HOME_GUILD_ID;
  const ids = raw
    .split(/[,\s]+/)
    .map(s => normalizeSnowflake(s))
    .filter(Boolean);
  if (!ids.length) throw new Error('No guild IDs resolved. Set UPDATE_GUILD_IDS or PRIMARY_GUILD_ID.');
  return ids;
}

const UPDATE_CHANNEL_ID = normalizeSnowflake(process.env.UPDATE_CHANNEL_ID || DEFAULT_UPDATE_CHANNEL_ID);
if (process.env.UPDATE_CHANNEL_ID && !UPDATE_CHANNEL_ID) {
  console.warn('Warning: UPDATE_CHANNEL_ID is set but no numeric channel ID was found. It will be ignored.');
}

async function main() {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN is required to push update announcements.');

  const originalUpdateContent = await fs.readFile(UPDATE_PATH, 'utf8').catch(err => {
    if (err.code === 'ENOENT') {
      throw new Error('UPDATE.md not found. Create the file before running updatepush.');
    }
    throw err;
  });

  const { version: fileVersion, changes } = parseUpdateFile(originalUpdateContent);
  const currentVersion = fileVersion || pkg.version;
  if (!currentVersion) throw new Error('Unable to determine current version from UPDATE.md or package.json.');
  if (!changes.length) throw new Error('No changes listed in UPDATE.md. Add bullet points before running updatepush.');

  const activeUpdateContent = setUpdateStatus(originalUpdateContent, 'update');
  const contentWithoutComments = stripHtmlComments(activeUpdateContent).trimEnd();
  const messageContent = appendInstallLink(contentWithoutComments);

  let updateStatusApplied = false;
  let updateResetToPending = false;

  if (activeUpdateContent !== originalUpdateContent) {
    await fs.writeFile(UPDATE_PATH, activeUpdateContent, 'utf8');
    updateStatusApplied = true;
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const failures = [];
  let successCount = 0;
  try {
    const guildIds = resolveGuildIds();
    await client.login(token);

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
          content: messageContent,
          mentionRoleId: UPDATE_ROLE_ID
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

    if (successCount === 0) {
      console.error('No guilds received the update announcement. Configure an update channel with /setupdatech and try again.');
      throw new Error('Update push aborted: no eligible guilds.');
    }

    if (failures.length) {
      console.warn('Some guilds did not receive the announcement. Resolve the errors above and re-run updatepush if needed.');
    }

    await recordLastUpdateVersion(currentVersion);

    const nextVersion = bumpPatch(currentVersion);

    const newUpdateContent = `# Pending Update\n\nversion: ${nextVersion}\n\n## Changes\n\n<!-- Add one bullet per noteworthy change below. Example: - Improved chip payout handling -->\n\n## Bug Fixes\n\n<!-- Add one bullet per bug fix below. Example: - Fixed crash when playing blackjack in DMs -->\n\n`;
    await fs.writeFile(UPDATE_PATH, newUpdateContent, 'utf8');
    updateResetToPending = true;

    const newPkg = { ...pkg, version: nextVersion };
    await fs.writeFile(path.join(ROOT, 'package.json'), `${JSON.stringify(newPkg, null, 2)}\n`, 'utf8');

    const lockPath = path.join(ROOT, 'package-lock.json');
    try {
      const lockText = await fs.readFile(lockPath, 'utf8');
      const lockData = JSON.parse(lockText);
      lockData.version = nextVersion;
      if (lockData.packages?.['']) {
        lockData.packages[''].version = nextVersion;
      }
      await fs.writeFile(lockPath, `${JSON.stringify(lockData, null, 2)}\n`, 'utf8');
    } catch (err) {
      console.warn('Warning: failed to rewrite package-lock.json with new version:', err?.message || err);
    }

    console.log(`Version bumped to ${nextVersion} and UPDATE.md reset.`);
  } finally {
    try {
      await client.destroy();
    } catch {
      // ignore destroy errors; client might not have been logged in yet
    }

    if (updateStatusApplied && !updateResetToPending) {
      await fs.writeFile(UPDATE_PATH, originalUpdateContent, 'utf8');
    }
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
