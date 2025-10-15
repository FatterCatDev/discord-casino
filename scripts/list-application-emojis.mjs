#!/usr/bin/env node
import 'dotenv/config';
import { Client } from 'discord.js';

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('DISCORD_TOKEN is required in your environment to list application emojis.');
  process.exit(1);
}

const client = new Client({ intents: [] });

client.once('ready', async () => {
  try {
    await client.application.fetch();
    const emojis = await client.application.emojis.fetch();
    if (!emojis.size) {
      console.log('No application emojis are registered for this bot.');
      return;
    }

    console.log(`Application emojis for ${client.application.name} (${client.application.id})`);
    for (const emoji of emojis.values()) {
      const display = emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
      console.log(`- ${emoji.name} — ${display} — ${emoji.id}`);
    }
  } catch (error) {
    console.error('Failed to fetch application emojis:', error);
  } finally {
    client.destroy();
  }
});

client.login(token).catch(error => {
  console.error('Failed to log in:', error);
  process.exit(1);
});

