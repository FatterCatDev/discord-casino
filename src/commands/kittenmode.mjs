import { setKittenMode } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';

export default async function handleKittenMode(interaction, ctx) {
  if (!interaction.guild) {
    return interaction.reply({ content: '❌ This command can only be used inside a server.', ephemeral: true });
  }
  if (!(await ctx.isAdmin(interaction))) {
    return interaction.reply({ content: '❌ You do not have permission to toggle Kitten mode.', ephemeral: true });
  }

  const enabled = interaction.options.getBoolean('enabled', true);
  const previous = typeof ctx.kittenModeEnabled === 'boolean' ? ctx.kittenModeEnabled : null;
  const settings = await setKittenMode(interaction.guild.id, enabled);
  const active = !!settings?.kitten_mode_enabled;
  if (typeof ctx.isKittenModeEnabled === 'function') {
    try { await ctx.isKittenModeEnabled(); } catch {}
  }

  let message;
  if (active) {
    message = previous === true
      ? `${emoji('kiss')} Kitten mode was already purring for this server. I\'m staying in that sultry, mature tone just for you, Kitten.`
      : `${emoji('kiss')} Kitten mode is now purring across this server. I\'ll slip into that mature, teasing tone and call everyone my Kitten.`;
  } else {
    message = previous === false
      ? 'Kitten mode was already disabled here. I\'ll keep the standard casino voice until you invite me to purr again.'
      : 'Kitten mode has been disabled for this server. I\'ll return to the standard casino voice.';
  }

  if (typeof ctx.kittenizeText === 'function') {
    message = ctx.kittenizeText(message);
  }

  return interaction.reply({ content: message, ephemeral: true });
}
