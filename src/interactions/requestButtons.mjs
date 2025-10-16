import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { updateActiveRequestStatus, clearActiveRequest, mintChips, burnFromUser, eraseUserData } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';
import { scheduleInteractionAck } from '../lib/interactionAck.mjs';

const REQUEST_BUTTON_STALE_MS = (() => {
  const specific = Number(process.env.REQUEST_BUTTON_STALE_MS);
  if (Number.isFinite(specific) && specific > 0) return specific;
  const general = Number(process.env.INTERACTION_STALE_MS);
  return Number.isFinite(general) && general > 0 ? general : 2500;
})();

export default async function handleRequestButtons(interaction, ctx) {
  const parts = interaction.customId.split('|');
  const action = parts[1]; // 'take' | 'done' | 'reject'
  const targetId = parts[2];
  const type = parts[3]; // 'buyin' | 'cashout'
  const amount = Number(parts[4]) || 0;

  let kittenMode;
  let kittenModeLoaded = false;
  const ensureKittenMode = async () => {
    if (!kittenModeLoaded) {
      kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
      kittenModeLoaded = true;
    }
    return kittenMode;
  };
  const say = (kitten, normal) => (kittenMode ? kitten : normal);

  const cancelAutoAck = scheduleInteractionAck(interaction, { timeout: REQUEST_BUTTON_STALE_MS, mode: 'update' });

  if (!(await ctx.isModerator(interaction))) {
    await ensureKittenMode();
    cancelAutoAck();
    return interaction.reply({ content: say('❌ Only my trusted moderators may touch these buttons, Kitten.', '❌ Moderators only.'), ephemeral: true });
  }

  const msg = interaction.message;
  const orig = msg.embeds?.[0];
  const embed = orig ? EmbedBuilder.from(orig) : new EmbedBuilder();
  const typeLabel = type === 'buyin' ? 'Buy In' : type === 'cashout' ? 'Cash Out' : 'Erase Account Data';
  const completeLabel = type === 'erase' ? 'Erase User Data' : 'Request Complete';
  let deferred = false;
  const deferUpdateOnce = async () => {
    if (!deferred) {
      await interaction.deferUpdate();
      deferred = true;
    }
  };

  if (action === 'take') {
    await deferUpdateOnce();
    await ensureKittenMode();
    const fields = Array.isArray(orig?.fields) ? orig.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline })) : [];
    const idx = fields.findIndex(f => f.name === 'Status');
    const takingText = type === 'erase'
      ? say(`In Progress — Your vigilant Kitten <@${interaction.user.id}> is validating the erasure`, `In Progress — Data review by <@${interaction.user.id}>`)
      : say(`In Progress — Your sultry Kitten <@${interaction.user.id}> is on the case`, `In Progress — Taken by <@${interaction.user.id}>`);
    if (idx >= 0) fields[idx].value = takingText;
    else fields.push({ name: 'Status', value: takingText });
    embed.setFields(fields);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`req|take|${targetId}|${type}|${amount}`).setLabel('Take Request').setStyle(ButtonStyle.Primary).setDisabled(true),
      new ButtonBuilder().setCustomId(`req|done|${targetId}|${type}|${amount}`).setLabel(completeLabel).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`req|reject|${targetId}|${type}|${amount}`).setLabel('Reject Request').setStyle(ButtonStyle.Danger)
    );
    try { await updateActiveRequestStatus(interaction.guild.id, targetId, 'TAKEN'); } catch {}
    await interaction.editReply({ embeds: [embed], components: [row] });
    return;
  }

  if (action === 'done') {
    try {
      await deferUpdateOnce();
      await ensureKittenMode();

      const guildId = interaction.guild?.id;
      let erasureSummary = null;

      if (type === 'buyin') {
        const { chips } = await mintChips(guildId, targetId, amount, 'request buy-in', interaction.user.id);
        await ctx.postCashLog(interaction, kittenMode
          ? [
              `${emoji('coin')} **Buy-in (Request)**`,
              `User: My daring Kitten <@${targetId}> • Amount: **${ctx.chipsAmount(amount)}**`,
              `User Chips (after): **${ctx.chipsAmount(chips)}**`
            ]
          : [
              `${emoji('coin')} **Buy-in (Request)**`,
              `User: <@${targetId}> • Amount: **${ctx.chipsAmount(amount)}**`,
              `User Chips (after): **${ctx.chipsAmount(chips)}**`
            ]);
        try {
          const user = await interaction.client.users.fetch(targetId);
          const dm = say(
            `${emoji('coin')} Buy-in: Come savor these chips, Kitten <@${targetId}> — processed by ${interaction.user.tag}.`,
            `${emoji('coin')} Buy-in: You received ${ctx.chipsAmount(amount)}. Processed by ${interaction.user.tag}.`
          );
          await user.send(dm);
        } catch {}
      } else if (type === 'cashout') {
        const { chips } = await burnFromUser(guildId, targetId, amount, 'request cashout', interaction.user.id);
        await ctx.postCashLog(interaction, kittenMode
          ? [
              `${emoji('moneyWings')} **Cash Out (Request)**`,
              `User: My daring Kitten <@${targetId}> • Amount: **${ctx.chipsAmount(amount)}**`,
              `User Chips (after): **${ctx.chipsAmount(chips)}**`
            ]
          : [
              `${emoji('moneyWings')} **Cash Out (Request)**`,
              `User: <@${targetId}> • Amount: **${ctx.chipsAmount(amount)}**`,
              `User Chips (after): **${ctx.chipsAmount(chips)}**`
            ]);
        try {
          const user = await interaction.client.users.fetch(targetId);
          const dm = say(
            `${emoji('moneyWings')} Cash Out: Easy now, Kitten <@${targetId}> — ${ctx.chipsAmount(amount)} removed by ${interaction.user.tag}.`,
            `${emoji('moneyWings')} Cash Out: ${ctx.chipsAmount(amount)} removed from your balance. Processed by ${interaction.user.tag}.`
          );
          await user.send(dm);
        } catch {}
      } else if (type === 'erase') {
        const summary = await eraseUserData(targetId);
        try {
          const user = await interaction.client.users.fetch(targetId);
          const dm = say(
            `${emoji('warning')} Your whispers were heard, Kitten — all of your Semuta Casino data has been erased at the request you made. Processed by ${interaction.user.tag}.`,
            `${emoji('warning')} Your Semuta Casino data has been erased. Processed by ${interaction.user.tag}.`
          );
          await user.send(dm);
        } catch {}

        const deleted = summary?.deleted || {};
        const updated = summary?.updated || {};
        const totalDeleted = Object.values(deleted).reduce((acc, val) => acc + (Number(val) || 0), 0);
        const totalUpdated = Object.values(updated).reduce((acc, val) => acc + (Number(val) || 0), 0);
        const details = [];
        if (totalDeleted > 0) details.push(`Records purged: **${totalDeleted}**`);
        if (totalUpdated > 0) details.push(`Records anonymized: **${totalUpdated}**`);
        const trims = Object.entries(deleted)
          .filter(([, count]) => count > 0)
          .slice(0, 6)
          .map(([key, count]) => `• ${key}: ${count}`);
        if (trims.length) details.push(trims.join('\n'));
        if (details.length) erasureSummary = details.join('\n');
      } else {
        await ensureKittenMode();
        if (deferred) {
          await interaction.followUp({ content: say('❌ I don’t recognize that request type, Kitten.', '❌ Unknown request type.'), ephemeral: true });
        } else {
          await interaction.reply({ content: say('❌ I don’t recognize that request type, Kitten.', '❌ Unknown request type.'), ephemeral: true });
        }
        return;
      }

      const fields = Array.isArray(orig?.fields) ? orig.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline })) : [];
      const statusIdx = fields.findIndex(f => f.name === 'Status');
      const statusValue = type === 'erase'
        ? say(`Complete — Data scrubbed by <@${interaction.user.id}>`, `Completed by <@${interaction.user.id}> — data erased`)
        : say(`Complete — Mistress <@${interaction.user.id}> has finished, Kitten`, `Completed by <@${interaction.user.id}>`);
      if (statusIdx >= 0) fields[statusIdx].value = statusValue;
      else fields.push({ name: 'Status', value: statusValue });

      if (erasureSummary) {
        const summaryIdx = fields.findIndex(f => f.name.toLowerCase() === 'erasure summary');
        if (summaryIdx >= 0) fields[summaryIdx].value = erasureSummary;
        else fields.push({ name: 'Erasure Summary', value: erasureSummary });
      }

      embed.setFields(fields);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`req|take|${targetId}|${type}|${amount}`).setLabel('Take Request').setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId(`req|done|${targetId}|${type}|${amount}`).setLabel(completeLabel).setStyle(ButtonStyle.Success).setDisabled(true),
        new ButtonBuilder().setCustomId(`req|reject|${targetId}|${type}|${amount}`).setLabel('Reject Request').setStyle(ButtonStyle.Danger).setDisabled(true)
      );
      try { await clearActiveRequest(interaction.guild.id, targetId); } catch {}
      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    } catch (e) {
      console.error('request done error:', e);
      await ensureKittenMode();
      if (deferred) {
        await interaction.followUp({ content: say('❌ I couldn’t complete that request, Kitten.', '❌ Failed to complete request.'), ephemeral: true });
      } else {
        await interaction.reply({ content: say('❌ I couldn’t complete that request, Kitten.', '❌ Failed to complete request.'), ephemeral: true });
      }
      return;
    }
  }

  if (action === 'reject') {
    const ageMs = Date.now() - interaction.createdTimestamp;
    if (ageMs > REQUEST_BUTTON_STALE_MS) {
      await ensureKittenMode();
      return interaction.reply({ content: say(`${emoji('hourglass')} This request widget cooled off, Kitten. Tap the command again.`, `${emoji('hourglass')} This request button expired. Please run /request again.`), ephemeral: true });
    }
    const modal = new ModalBuilder()
      .setCustomId(`req|rejmodal|${interaction.message.id}|${targetId}|${type}|${amount}`)
      .setTitle('Reject Request');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true)
    ));
    try {
      return await interaction.showModal(modal);
    } catch (err) {
      if (err?.code === 10062) {
        console.warn('Request reject interaction expired before modal could open.');
        return;
      }
      throw err;
    }
  }

  await ensureKittenMode();
  return interaction.reply({ content: say('❌ Naughty Kitten, that action is unknown.', '❌ Unknown action.'), ephemeral: true });
}
// Interaction: Request admin action buttons (Take/Complete/Reject)
