#!/usr/bin/env node
import 'dotenv/config';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'discord.js';
import { BASE_EMOJI } from '../src/lib/emojis.mjs';

const token = process.env.DISCORD_TOKEN;
const outPath = process.argv[2] || process.env.EMOJI_MAP_OUT || 'debug/emojis.json';

if (!token) {
  console.error('DISCORD_TOKEN is required in your environment to build the emoji map.');
  process.exit(1);
}

const client = new Client({ intents: [] });

function parseEmojiName(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^<a?:([^:]+):(\d+)>$/);
  return match ? match[1] : null;
}

client.once('ready', async () => {
  try {
    await client.application.fetch();
    const emojis = await client.application.emojis.fetch();
    const byName = new Map(emojis.map(emoji => [emoji.name, emoji]));

    const overrides = {};
    const missing = [];

    for (const [key, value] of Object.entries(BASE_EMOJI)) {
      const name = parseEmojiName(value);
      if (!name) continue;
      const emoji = byName.get(name);
      if (!emoji) {
        missing.push(name);
        continue;
      }
      const display = emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
      overrides[key] = display;
    }

    const fullPath = path.resolve(outPath);
    const dir = path.dirname(fullPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, `${JSON.stringify(overrides, null, 2)}\n`);

    console.log(`Wrote emoji override map to ${fullPath}`);
    console.log(`Mapped ${Object.keys(overrides).length} custom emojis.`);
    if (missing.length) {
      console.warn(`Missing ${missing.length} emoji name(s) in this app.`);
      console.warn(missing.join(', '));
    }
  } catch (error) {
    console.error('Failed to build emoji override map:', error);
  } finally {
    client.destroy();
  }
});

client.login(token).catch(error => {
  console.error('Failed to log in:', error);
  process.exit(1);
});
