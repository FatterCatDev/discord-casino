#!/usr/bin/env node
import { REST, Routes } from 'discord.js';
import 'dotenv/config';

const GUILD_ID = process.env.GUILD_ID || '1200629872423346246';
const token = process.env.DISCORD_TOKEN;
const DEFAULT_MENTION_ROLE_ID = '1426725492538478593';
const HOME_PAGE_URL = 'https://semutacasino.com/';
const HOME_PAGE_FOOTER = `🔗 Home page: ${HOME_PAGE_URL}`;
const CASINO_CUSTOMERS_ROLE_ID = (
  process.env.POST_MESSAGE_ROLE_ID ||
  process.env.CASINO_CUSTOMERS_ROLE_ID ||
  DEFAULT_MENTION_ROLE_ID
).trim();

if (!token) {
  console.error('DISCORD_TOKEN is not set in the environment.');
  process.exit(1);
}

const [,, channelIdArg, ...messageParts] = process.argv;

if (!channelIdArg) {
  console.error('Usage: node scripts/post-message.mjs <channelId> "message text"');
  process.exit(1);
}

const channelId = channelIdArg.trim();
let content = messageParts.join(' ').trim();

async function readStdin() {
  return new Promise(resolve => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
  });
}

const run = async () => {
  if (!content) {
    const stat = await readStdin();
    if (stat) content = stat;
  }

  if (!content) {
    console.error('No message content provided (either pass it as an argument or pipe stdin).');
    process.exit(1);
  }

  if (!content.includes(HOME_PAGE_URL)) {
    content = `${content}\n\n${HOME_PAGE_FOOTER}`;
  }

  // Prepend one role mention header so announcement posts ping Casino Customers.
  if (CASINO_CUSTOMERS_ROLE_ID) {
    content = `<@&${CASINO_CUSTOMERS_ROLE_ID}>\n\n${content}`;
  }

  const rest = new REST({ version: '10' }).setToken(token);

  const splitMessage = (text, max = 2000) => {
    if (text.length <= max) return [text];
    const segments = [];
    let buffer = '';
    const lines = text.split('\n');
    for (const line of lines) {
      const candidate = buffer ? `${buffer}\n${line}` : line;
      if (candidate.length <= max) {
        buffer = candidate;
      } else {
        if (buffer) segments.push(buffer);
        buffer = '';
        if (line.length <= max) {
          buffer = line;
        } else {
          let remaining = line;
          while (remaining.length > max) {
            segments.push(remaining.slice(0, max));
            remaining = remaining.slice(max);
          }
          if (remaining) buffer = remaining;
        }
      }
    }
    if (buffer) segments.push(buffer);
    return segments;
  };

  try {
    const channel = await rest.get(Routes.channel(channelId));
    if (String(channel.guild_id) !== String(GUILD_ID)) {
      console.error(`Channel ${channelId} is not part of guild ${GUILD_ID}.`);
      process.exit(1);
    }

    const segments = splitMessage(content);
    for (const segment of segments) {
      await rest.post(Routes.channelMessages(channelId), {
        body: {
          content: segment,
          allowed_mentions: CASINO_CUSTOMERS_ROLE_ID
            ? { parse: [], roles: [CASINO_CUSTOMERS_ROLE_ID] }
            : undefined,
        },
      });
    }
    console.log(`Posted ${segments.length} message segment(s) to channel ${channelId}.`);
  } catch (err) {
    console.error('Failed to post message:', err);
    process.exit(1);
  }
};

run();
// Use "cat new-message.md | node scripts/post-message.mjs 1426730736312123466"
