import { emoji } from '../lib/emojis.mjs';

export default async function handlePing(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const pong = emoji('pingPong');
  const message = kittenMode ? `Pong, Kitten ${pong}` : `Pong ${pong}`;
  return interaction.reply({ content: message, ephemeral: true });
}
