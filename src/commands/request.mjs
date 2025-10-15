import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getGuildSettings, getActiveRequest, getLastRequestAt, getUserBalances, createActiveRequest, setLastRequestNow } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';

export default async function handleRequest(interaction, ctx) {
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const type = interaction.options.getString('type'); // 'buyin' | 'cashout' | 'erase'
  let amount = interaction.options.getInteger('amount');
  const notesRaw = interaction.options.getString('notes');
  const notes = notesRaw ? notesRaw.trim() : '';

  const typeLabel = type === 'buyin'
    ? 'Buy In'
    : type === 'cashout'
      ? 'Cash Out'
      : type === 'erase'
        ? 'Erase Account Data'
        : 'Unknown';

  if (type !== 'buyin' && type !== 'cashout' && type !== 'erase') {
    return interaction.reply({ content: say('❌ That request leaves me puzzled, Kitten.', '❌ Unknown request type.'), ephemeral: true });
  }

  if (type === 'erase') {
    amount = 0;
    if (!notes) {
      return interaction.reply({
        content: say('❌ Whisper a short reason for me, Kitten — I need a note to file this erasure.', '❌ Please provide notes describing the erasure request.'),
        ephemeral: true
      });
    }
  } else if (!Number.isInteger(amount) || amount <= 0) {
    return interaction.reply({ content: say('❌ Offer me a positive amount if you want service, Kitten.', '❌ Amount must be a positive integer.'), ephemeral: true });
  }

  const primaryGuildId = process.env.PRIMARY_GUILD_ID || process.env.GUILD_ID || null;
  const requestGuildId = type === 'erase' ? (primaryGuildId || interaction.guild.id) : interaction.guild.id;

  const settings = await getGuildSettings(requestGuildId);
  try {
    const active = await getActiveRequest(requestGuildId, interaction.user.id);
    if (active) return interaction.reply({ content: `${emoji('hourglass')} You already have an active request. Please wait until it is completed or rejected.`, ephemeral: true });
  } catch {}
  const cooldown = Number(settings.request_cooldown_sec || 0);
  if (cooldown > 0) {
    const now = Math.floor(Date.now() / 1000);
    const last = await getLastRequestAt(requestGuildId, interaction.user.id);
    const elapsed = now - (last || 0);
    if (last && elapsed < cooldown) {
      const remain = cooldown - elapsed;
      return interaction.reply({ content: say(`${emoji('hourglass')} You can submit another request in ${remain} seconds, Kitten.`, `${emoji('hourglass')} You can submit another request in ${remain} seconds.`), ephemeral: true });
    }
  }
  const reqChannelId = settings.request_channel_id;
  if (!reqChannelId) {
    return interaction.reply({ content: say('❌ The requests channel isn’t configured, Kitten. Whisper to an admin for me.', '❌ Requests channel is not configured. Please contact an admin.'), ephemeral: true });
  }

  const reqChannel = await interaction.client.channels.fetch(reqChannelId).catch(() => null);
  if (!reqChannel || !reqChannel.isTextBased()) {
    return interaction.reply({ content: say('❌ I can’t reach the requests channel, Kitten.', '❌ Requests channel is invalid or inaccessible.'), ephemeral: true });
  }

  let mentions = '';
  if (type === 'erase') {
    try {
      const owners = Array.isArray(ctx?.ownerUserIds) ? ctx.ownerUserIds : [];
      if (owners.length) {
        mentions = Array.from(new Set(owners.map(id => String(id)))).map(id => `<@${id}>`).join(' ');
      }
    } catch {}
  } else {
    try {
      const adminIds = await ctx.listAdmins();
      const modIds = await ctx.listModerators();
      const unique = Array.from(new Set([...(adminIds || []), ...(modIds || [])]));
      if (unique.length) {
        mentions = unique.map(id => `<@${id}>`).join(' ');
      }
    } catch {}
  }

  let balText = '';
  try {
    const { chips: reqChips, credits: reqCredits } = await getUserBalances(interaction.guild?.id, interaction.user.id);
    const fmt = new Intl.NumberFormat('en-US');
    balText = `Chips: **${ctx.chipsAmount(reqChips)}**\nCredits: **${fmt.format(reqCredits)}**`;
  } catch {}

  const embedColor = type === 'buyin' ? 0x57F287 : type === 'cashout' ? 0xED4245 : 0x5865F2;
  const baseTitle = type === 'erase'
    ? say(`${emoji('warning')} Kitten’s Erasure Plea`, `${emoji('warning')} Data Erasure Request`)
    : say(`${emoji('clipboard')} Kitten’s Chip Request`, `${emoji('clipboard')} Chip Request`);

  const fields = [
    { name: say('Requester — your confident Kitten', 'Requester'), value: `<@${interaction.user.id}>`, inline: true },
    { name: 'Type', value: typeLabel, inline: true }
  ];

  if (type === 'erase') {
    fields.push({ name: 'User ID', value: `\`${interaction.user.id}\``, inline: true });
  } else {
    fields.push({ name: 'Amount', value: `**${ctx.chipsAmount(amount)}**`, inline: true });
  }

  fields.push({ name: say('Requester Balance, Kitten', 'Requester Balance'), value: balText || '_unavailable_' });

  if (type === 'erase') {
    const guildName = interaction.guild ? `${interaction.guild.name} (\`${interaction.guild.id}\`)` : '_unknown guild_';
    fields.push({ name: 'Origin Server', value: guildName });
  }

  if (notes) {
    fields.push({ name: type === 'erase' ? 'Notes' : 'Additional Notes', value: notes });
  }

  fields.push({ name: say('Status, Sweetheart', 'Status'), value: say('Pending — purring for attention', type === 'erase' ? 'Pending — verify before erasing' : 'Pending') });

  const e = new EmbedBuilder()
    .setTitle(baseTitle)
    .setColor(embedColor)
    .addFields(fields)
    .setTimestamp(new Date());

  const takeLabel = 'Take Request';
  const completeLabel = type === 'erase' ? 'Erase User Data' : 'Request Complete';
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`req|take|${interaction.user.id}|${type}|${amount}`).setLabel(takeLabel).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`req|done|${interaction.user.id}|${type}|${amount}`).setLabel(completeLabel).setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`req|reject|${interaction.user.id}|${type}|${amount}`).setLabel('Reject Request').setStyle(ButtonStyle.Danger)
  );

  let payload = { content: mentions || undefined, embeds: [e], components: [row] };
  if (typeof ctx?.kittenizePayload === 'function') {
    payload = ctx.kittenizePayload(payload);
  }
  const sent = await reqChannel.send(payload);
  try { await createActiveRequest(requestGuildId, interaction.user.id, sent.id, type, amount); } catch {}
  try { await setLastRequestNow(requestGuildId, interaction.user.id); } catch {}
  return interaction.reply({
    content: type === 'erase'
      ? say('✅ Your erasure plea is in motion. I will summon the caretakers, Kitten.', '✅ Your erasure request has been submitted to the global review queue.')
      : say('✅ Your request is tucked away. I’ll tease the staff for you, Kitten.', '✅ Your request has been submitted.'),
    ephemeral: true
  });
}
