import { getRaceByChannel, createHorseRace } from '../games/horserace.mjs';
import { emoji } from '../lib/emojis.mjs';

export default async function handleHorseRace(interaction, ctx) {
  if (!interaction.guildId) {
    return interaction.reply({ content: `${emoji('cross')} This command can only be used inside a server.` });
  }

  if (getRaceByChannel(interaction.channelId)) {
    return interaction.reply({ content: `${emoji('cross')} A horse race is already running in this channel. Please wait for it to finish.` });
  }

  await createHorseRace(interaction, ctx);
}
