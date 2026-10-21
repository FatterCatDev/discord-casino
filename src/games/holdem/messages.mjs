import { emoji } from '../../lib/emojis.mjs';
import { withInsufficientFundsTip } from '../../lib/fundsTip.mjs';
import { applyKittenPayload, applyKittenText } from './persona.mjs';
import { buildTablePayload } from './presentation.mjs';

export async function updateTableCard(client, state, payload = null) {
  try {
    if (!state.msgId) return false;
    const chId = state.msgChannelId || state.channelId;
    const ch = await client.channels.fetch(chId);
    if (!ch || !ch.isTextBased()) return false;
    const msg = await ch.messages.fetch(state.msgId);
    const data = payload || buildTablePayload(state);
    const personaPayload = applyKittenPayload(state, data);
    await msg.edit(personaPayload);
    return true;
  } catch { return false; }
}

function getTableChannel(client, state) {
  return (async () => {
    try {
      const chId = state.msgChannelId || state.channelId;
      const ch = await client.channels.fetch(chId);
      return (ch && ch.isTextBased()) ? ch : null;
    } catch { return null; }
  })();
}

export async function postOrEditNotice(client, state, content) {
  try {
    const ch = await getTableChannel(client, state);
    if (!ch) return;
    if (state.noticeMsgId) {
      try {
        const msg = await ch.messages.fetch(state.noticeMsgId);
        const payload = applyKittenPayload(state, { content });
        await msg.edit(payload);
        return;
      } catch {}
    }
    const sent = await ch.send(applyKittenPayload(state, { content }));
    state.noticeMsgId = sent.id;
  } catch {}
}

export async function deleteNotice(client, state) {
  try {
    if (!state.noticeMsgId) return;
    const ch = await getTableChannel(client, state);
    if (!ch) return;
    const msg = await ch.messages.fetch(state.noticeMsgId).catch(() => null);
    if (msg) await msg.delete().catch(()=>{});
  } catch {}
  try { state.noticeMsgId = null; } catch {}
}

export async function announce(client, state, text) {
  try {
    const ch = await getTableChannel(client, state);
    if (ch) {
      const personaText = applyKittenText(state, text);
      await ch.send({ content: personaText });
    }
  } catch {}
}

export async function notifyAutoKick(client, state, removed) {
  try {
    if (!removed?.length) return;
    const bb = Number(state.bb) || 0;
    for (const r of removed) {
      try {
        const user = await client.users.fetch(r.userId);
        const base = `${emoji('noEntry')} You were removed from the Hold’em table — insufficient chips to cover the big blind (${bb}).`;
        const enriched = withInsufficientFundsTip(base, state?.kittenMode === true);
        const msg = applyKittenText(state, enriched);
        await user.send(msg);
      } catch {}
    }
  } catch {}
}
