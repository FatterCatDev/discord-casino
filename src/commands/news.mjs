import { getUserNewsSettings, setUserNewsOptIn } from '../db/db.auto.mjs';
import { getActiveNews } from '../services/news.mjs';

function formatStatusMessage({ enabled }) {
  return enabled
    ? '📰 News alerts are currently **ON**. I will send you at most one heads-up each week when there is active news.'
    : '🔕 News alerts are currently **OFF**. I will stay quiet when new updates are posted.';
}

function withKitten(ctx, text) {
  if (typeof ctx?.kittenizeText === 'function') {
    try {
      return ctx.kittenizeText(text);
    } catch {
      return text;
    }
  }
  return text;
}

function appendCurrentNews(lines, entry) {
  if (!entry || !entry.body) return;
  const range = entry.endDate ? `${entry.startDate} → ${entry.endDate}` : entry.startDate;
  lines.push('');
  if (entry.title) {
    lines.push(`**${entry.title}**`);
  } else {
    lines.push('Current news:');
  }
  if (range) {
    lines.push(`Dates: ${range}`);
  }
  lines.push(entry.body);
}

export default async function handleNews(interaction, ctx) {
  const userId = interaction.user?.id;
  if (!userId) {
    return interaction.reply({
      content: '❌ I could not identify your Discord account for this toggle.',
      ephemeral: true
    });
  }

  const boolOption = interaction.options?.getBoolean?.('enabled');
  const modeOption = interaction.options?.getString?.('mode');

  let desired;
  if (typeof boolOption === 'boolean') {
    desired = boolOption;
  } else if (typeof modeOption === 'string') {
    const normalized = modeOption.trim().toLowerCase();
    if (['on', 'enable', 'enabled', 'true', 'yes'].includes(normalized)) desired = true;
    if (['off', 'disable', 'disabled', 'false', 'no'].includes(normalized)) desired = false;
  }

  if (typeof desired === 'boolean') {
    const settings = await setUserNewsOptIn(userId, desired);
    const message = desired
      ? '📰 You will now receive short news blurbs when new updates are live.'
      : '🔕 News blurbs have been silenced. Use `/news enabled:true` anytime to opt back in.';
    const followUp = formatStatusMessage({ enabled: !!settings?.newsOptIn });
    const lines = [message, followUp];
    const activeNews = await getActiveNews();
    if (desired) appendCurrentNews(lines, activeNews);
    return interaction.reply({
      content: withKitten(ctx, lines.filter(Boolean).join('\n')),
      ephemeral: true
    });
  }

  const settings = await getUserNewsSettings(userId);
  const lines = [
    formatStatusMessage({ enabled: !!settings?.newsOptIn }),
    '',
    'Use `/news enabled:true` or `/news enabled:false` to change this preference.'
  ];
  const activeNews = await getActiveNews();
  appendCurrentNews(lines, activeNews);

  return interaction.reply({
    content: withKitten(ctx, lines.filter(Boolean).join('\n')),
    ephemeral: true
  });
}
