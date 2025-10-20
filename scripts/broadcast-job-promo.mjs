#!/usr/bin/env node
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { listAllUserIds } from '../src/db/db.auto.mjs';

const FALLBACK_MESSAGE = [
  '💼 **Semuta Casino Job System Is Live**',
  '',
  '• Run `/job` to open the new control panel, swap careers, and launch shifts anywhere you play.',
  '• Bartender, Card Dealer, and Bouncer shifts now stream live updates, art, and five-stage challenges straight into your DMs.',
  '• Stamina carries across every guild. Charges regen every 2 hours, and admins can top you off for marathons or events.',
  '• Performance grades unlock rank promotions, bigger base pay, and random tip bonuses—score high to climb the global ladder.',
  '',
  'Clock in, earn chips, and show the casino you’re ready for the big leagues. See you on the floor!'
].join('\n');

const DEFAULT_DELAY_MS = 1500;
const delayMs = Number.isFinite(Number(process.env.BROADCAST_DELAY_MS))
  ? Number(process.env.BROADCAST_DELAY_MS)
  : DEFAULT_DELAY_MS;

const DEFAULT_CONCURRENCY = 50;
const concurrency = Number.isFinite(Number(process.env.BROADCAST_BATCH_SIZE)) && Number(process.env.BROADCAST_BATCH_SIZE) > 0
  ? Number(process.env.BROADCAST_BATCH_SIZE)
  : DEFAULT_CONCURRENCY;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
  if (!token) {
    console.error('Missing DISCORD_TOKEN (or BOT_TOKEN) environment variable.');
    process.exitCode = 1;
    return;
  }

  const messagePath = process.argv[2] ? path.resolve(process.argv[2]) : null;
  let promoMessage = FALLBACK_MESSAGE;
  if (messagePath) {
    try {
      const contents = await readFile(messagePath, 'utf8');
      promoMessage = contents.trim();
      console.log(`Loaded broadcast message from ${messagePath}`);
    } catch (err) {
      console.warn(`Failed to read ${messagePath}: ${err?.message || err}. Using fallback message.`);
    }
  }

  if (!promoMessage.length) {
    console.error('Broadcast message is empty. Abort.');
    process.exitCode = 1;
    return;
  }

  let segments = sliceIntoSegments(promoMessage, 2000);
  if (segments.length > 1) {
    let adjusted = segments;
    while (true) {
      const digitCount = String(adjusted.length).length;
      const prefixLen = (2 * digitCount) + 4; // "(x/y)\n"
      const limit = Math.max(1, 2000 - prefixLen);
      const recalculated = sliceIntoSegments(promoMessage, limit);
      if (recalculated.length === adjusted.length) {
        segments = recalculated;
        break;
      }
      adjusted = recalculated;
    }
    console.log(`Message exceeds 2000 characters. Splitting into ${segments.length} segment(s) with prefix allowance.`);
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel]
  });

  await client.login(token);
  console.log(`Logged in as ${client.user?.tag ?? client.user?.id ?? 'unknown user'}`);

  const rawIds = await listAllUserIds();
  const uniqueIds = Array.from(new Set((rawIds || []).map(id => String(id).trim()).filter(Boolean)));
  console.log(`Preparing to DM ${uniqueIds.length} unique user(s). Delay per DM: ${delayMs}ms`);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  async function sendToUser(userId) {
    try {
      const user = await client.users.fetch(userId, { force: false }).catch(() => null);
      if (!user) {
        skipped += 1;
        console.warn(`[skip] Could not fetch user ${userId}`);
        return;
      }
      if (user.bot) {
        skipped += 1;
        console.log(`[skip] ${user.tag} is a bot`);
        return;
      }
      for (const [idx, segment] of segments.entries()) {
        const content = segments.length > 1
          ? `(${idx + 1}/${segments.length})\n${segment}`
          : segment;
        await user.send(content);
        if (idx < segments.length - 1) {
          await wait(500);
        }
      }
      sent += 1;
      console.log(`[sent] Promo delivered to ${user.tag} (${user.id})`);
    } catch (err) {
      failed += 1;
      console.warn(`[fail] Could not DM ${userId}:`, err?.message || err);
    }
  }

  for (let i = 0; i < uniqueIds.length; i += concurrency) {
    const batch = uniqueIds.slice(i, i + concurrency);
    await Promise.all(batch.map(userId => sendToUser(userId)));
    if (i + concurrency < uniqueIds.length) {
      await wait(delayMs);
    }
  }

  console.log(`Broadcast complete. Sent: ${sent}, Skipped: ${skipped}, Failed: ${failed}`);
  await client.destroy();
}

main().catch(err => {
  console.error('Broadcast script encountered an error:', err);
  process.exitCode = 1;
});

function sliceIntoSegments(text, maxLength) {
  if (!text || text.length <= maxLength) return [text];
  const segments = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      segments.push(remaining);
      break;
    }
    let sliceEnd = maxLength;
    const chunk = remaining.slice(0, sliceEnd);
    const lastNewline = chunk.lastIndexOf('\n');
    const lastSpace = chunk.lastIndexOf(' ');
    const breakPoint = Math.max(lastNewline, lastSpace);
    if (breakPoint > 0 && breakPoint >= maxLength * 0.5) {
      sliceEnd = breakPoint;
    }
    const piece = remaining.slice(0, sliceEnd).trim();
    segments.push(piece);
    remaining = remaining.slice(sliceEnd).trimStart();
  }
  return segments.length ? segments : [''];
}

// node scripts/broadcast-job-promo.mjs docs/<docName.md>
