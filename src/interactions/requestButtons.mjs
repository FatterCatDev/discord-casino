import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { updateActiveRequestStatus, clearActiveRequest, mintChips, burnFromUser, eraseUserData } from '../db/db.auto.mjs';
import { emoji } from '../lib/emojis.mjs';

export default async function handleRequestButtons(interaction, ctx) {
  const parts = interaction.customId.split('|');
  const action = parts[1]; // 'take' | 'done' | 'reject'
  const targetId = parts[2];
  const type = parts[3]; // 'buyin' | 'cashout'
  const amount = Number(parts[4]) || 0;
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  if (!(await ctx.isModerator(interaction))) {
    return interaction.reply({ content: say('❌ Only my trusted moderators may touch these buttons, Kitten.', '❌ Moderators only.'), ephemeral: true });
  }
  const msg = interaction.message;
  const orig = msg.embeds?.[0];
  const embed = orig ? EmbedBuilder.from(orig) : new EmbedBuilder();
  const typeLabel = type === 'buyin' ? 'Buy In' : type === 'cashout' ? 'Cash Out' : 'Erase Account Data';
  const completeLabel = type === 'erase' ? 'Erase User Data' : 'Request Complete';

  if (action === 'take') {
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
    return interaction.update({ embeds: [embed], components: [row] });
  }

  if (action === 'done') {
    try {
      const guildId = interaction.guild?.id;
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
        // try { const user = await interaction.client.users.fetch(targetId); await user.send(`${emoji('coin')} Buy-in: Come savor these chips, Kitten <@${targetId}> — with affection from your mistress.`); } catch {}
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
        // try { const user = await interaction.client.users.fetch(targetId); await user.send(`${emoji('moneyWings')} Cash Out: Easy now, Kitten <@${targetId}> — your balance bends to your desires.`); } catch {}
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
        const fields = Array.isArray(orig?.fields) ? orig.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline })) : [];
        const idx = fields.findIndex(f => f.name === 'Status');
        const statusValue = say(`Complete — Data scrubbed by <@${interaction.user.id}>`, `Completed by <@${interaction.user.id}> — data erased`);
        if (idx >= 0) fields[idx].value = statusValue;
        else fields.push({ name: 'Status', value: statusValue });

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
        if (details.length) {
          const summaryFieldIdx = fields.findIndex(f => f.name.toLowerCase() === 'erasure summary');
          const value = details.join('\n');
          if (summaryFieldIdx >= 0) fields[summaryFieldIdx].value = value;
          else fields.push({ name: 'Erasure Summary', value });
        }
        embed.setFields(fields);
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`req|take|${targetId}|${type}|${amount}`).setLabel('Take Request').setStyle(ButtonStyle.Primary).setDisabled(true),
          new ButtonBuilder().setCustomId(`req|done|${targetId}|${type}|${amount}`).setLabel(completeLabel).setStyle(ButtonStyle.Success).setDisabled(true),
          new ButtonBuilder().setCustomId(`req|reject|${targetId}|${type}|${amount}`).setLabel('Reject Request').setStyle(ButtonStyle.Danger).setDisabled(true)
        );
        try { await clearActiveRequest(interaction.guild.id, targetId); } catch {}
        return interaction.update({ embeds: [embed], components: [row] });
      } else {
        return interaction.reply({ content: say('❌ I don’t recognize that request type, Kitten.', '❌ Unknown request type.'), ephemeral: true });
      }
      const fields = Array.isArray(orig?.fields) ? orig.fields.map(f => ({ name: f.name, value: f.value, inline: f.inline })) : [];
      const idx = fields.findIndex(f => f.name === 'Status');
      const statusValue = say(`Complete — Mistress <@${interaction.user.id}> has finished, Kitten`, `Completed by <@${interaction.user.id}>`);
      if (idx >= 0) fields[idx].value = statusValue;
      else fields.push({ name: 'Status', value: statusValue });
      embed.setFields(fields);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`req|take|${targetId}|${type}|${amount}`).setLabel('Take Request').setStyle(ButtonStyle.Primary).setDisabled(true),
        new ButtonBuilder().setCustomId(`req|done|${targetId}|${type}|${amount}`).setLabel(completeLabel).setStyle(ButtonStyle.Success).setDisabled(true),
        new ButtonBuilder().setCustomId(`req|reject|${targetId}|${type}|${amount}`).setLabel('Reject Request').setStyle(ButtonStyle.Danger).setDisabled(true)
      );
      try { await clearActiveRequest(interaction.guild.id, targetId); } catch {}
      return interaction.update({ embeds: [embed], components: [row] });
    } catch (e) {
      console.error('request done error:', e);
      return interaction.reply({ content: say('❌ I couldn’t complete that request, Kitten.', '❌ Failed to complete request.'), ephemeral: true });
    }
  }

  if (action === 'reject') {
    const modal = new ModalBuilder()
      .setCustomId(`req|rejmodal|${interaction.message.id}|${targetId}|${type}|${amount}`)
      .setTitle('Reject Request');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('reason').setLabel('Reason').setStyle(TextInputStyle.Paragraph).setRequired(true)
    ));
    return interaction.showModal(modal);
  }

  return interaction.reply({ content: say('❌ Naughty Kitten, that action is unknown.', '❌ Unknown action.'), ephemeral: true });
}
// Interaction: Request admin action buttons (Take/Complete/Reject)
