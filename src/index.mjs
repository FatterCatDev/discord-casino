import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import { BOT_VERSION, pushUpdateAnnouncement } from './services/updates.mjs';
import { registerRuntime } from './runtime/application.mjs';

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages]
});
client.botVersion = BOT_VERSION;
client.pushUpdateAnnouncement = (guildId, details = {}) => pushUpdateAnnouncement(client, guildId, details);

registerRuntime(client);
client.login(process.env.DISCORD_TOKEN);
