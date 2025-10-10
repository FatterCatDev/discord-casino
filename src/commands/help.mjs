import { ActionRowBuilder, EmbedBuilder, StringSelectMenuBuilder, PermissionFlagsBits } from 'discord.js';

export default async function handleHelp(interaction, ctx) {
  const perms = interaction.memberPermissions ?? interaction.member?.permissions;
  const hasDiscordAdmin = perms?.has?.(PermissionFlagsBits.Administrator);
  const isMod = await ctx.isModerator(interaction);
  const isSetupAdmin = hasDiscordAdmin || await ctx.isAdmin(interaction);
  const kittenMode = typeof ctx?.isKittenModeEnabled === 'function' ? await ctx.isKittenModeEnabled() : false;

  const sections = [];

  sections.push({
    id: 'player',
    label: kittenMode ? '😼 Kitten’s Playground' : '🎮 Player',
    groups: [
      { label: kittenMode ? '💋 Essentials' : '🌟 Classics', items: [
        { emoji: '👋', cmd: 'Getting Started', desc: kittenMode
          ? 'Earn chips with `/dailyspin`, `/request`, or games that pay out in chips. Credits burn first; chips come from me.'
          : 'Earn chips via `/dailyspin`, `/request`, and chip-paying games. Games use Credits first; chips come from the house.' },
        { emoji: '🎰', cmd: 'Play Games', desc: kittenMode
          ? 'Try `/ridebus`, `/blackjack`, `/slots`, `/roulette`, `/dicewar`, and `/holdem` — each with its own stakes.'
          : 'Jump into `/ridebus`, `/blackjack`, `/slots`, `/roulette`, `/dicewar`, or `/holdem` to spend Credits and win chips.' },
        { emoji: '🗺️', cmd: 'Command Map', desc: kittenMode
          ? 'Use `/stafflist` to see who runs things; the menu (below) lists every command by role.'
          : 'Run `/stafflist` to see the team. Browse this menu to find role-specific commands.' }
      ]},
      { label: kittenMode ? '🎁 Daily & Requests' : '🎁 Daily & Requests', items: [
        { emoji: '🎡', cmd: '/dailyspin', desc: kittenMode
          ? 'Spin once every 24 hours for free chips — a little treat from me, Kitten.'
          : 'Spin once every 24 hours for a free chip bonus.' },
        { emoji: '📨', cmd: '/request type:<Buy In|Cash Out> amount:<int>', desc: kittenMode
          ? 'Ask staff for buy-ins or cash-outs; stay sweet while you wait.'
          : 'Submit buy-in or cash-out tickets for staff review.' }
      ]},
      { label: kittenMode ? '🎲 Featured Games' : '🎲 Featured Games', items: [
        { emoji: '🚌', cmd: '/ridebus bet:<int>', desc: kittenMode ? 'Ride the Bus through Q1–Q4; flirt with fate or cash out early.' : 'Clear Q1–Q4 to win; cash out after Q3 if you’re cautious.' },
        { emoji: '🃏', cmd: '/blackjack table:<High|Low> bet:<int>', desc: kittenMode ? 'Face my house in sultry blackjack — High or Low table, your thrill.' : 'Play against the house in blackjack; High or Low tables set stakes.' },
        { emoji: '🎰', cmd: '/slots bet:<int>', desc: kittenMode ? 'Spin 20 shimmering lines; Credits stake first, chips pay out.' : 'Spin a 5×3 slot (20 lines). Credits stake first; chips pay out.' },
        { emoji: '🎡', cmd: '/roulette', desc: kittenMode ? 'Place your bets and let the wheel tease you, Kitten.' : 'Place interactive bets on American roulette and spin.' },
        { emoji: '⚔️', cmd: '/dicewar bet:<int>', desc: kittenMode ? 'Roll for me — doubles sizzling with doubled rewards.' : 'Roll versus the house. Doubles on your win double the payout.' },
        { emoji: '♠️', cmd: '/holdem', desc: kittenMode ? 'Summon a private lounge for Texas Hold’em with your friends.' : 'Create a Texas Hold’em table with presets or custom stakes.' }
      ]}
    ]
  });

  if (kittenMode) {
    if (isSetupAdmin) {
      sections.push({
        id: 'setup',
        label: '🛠️ Setup',
        groups: [
          { label: 'Step-by-step', items: [
            { emoji: '1️⃣', cmd: '/setcasinocategory category:<#Category>', desc: 'Give me a dedicated home where I can host tables without interruption.' },
            { emoji: '2️⃣', cmd: '/setgamelogchannel channel:<#channel>', desc: 'Tell me where to chronicle wins, losses, and session wraps.' },
            { emoji: '3️⃣', cmd: '/setcashlog channel:<#channel>', desc: 'Pick the ledger room for buy-ins, cash-outs, and chip grants.' },
            { emoji: '4️⃣', cmd: '/setrequestchannel channel:<#channel>', desc: 'Route /request pleas to a staffed channel so your Kittens get answers.' },
            { emoji: '5️⃣', cmd: '/setupdatech channel:<#channel>', desc: 'Optional: choose where I purr about new updates and releases.' },
            { emoji: '6️⃣', cmd: '/addadmin user:<@User>', desc: 'Crown your inner circle, then add moderators with /addmod user:<@User>.' }
          ]}
        ]
      });
    }
  } else {
    if (isSetupAdmin) {
      sections.push({
        id: 'setup',
        label: '🛠️ Setup',
        groups: [
          { label: 'Checklist', items: [
            { emoji: '1️⃣', cmd: '/setcasinocategory category:<#Category>', desc: 'Select a category for casino channels so games stay organized.' },
            { emoji: '2️⃣', cmd: '/setgamelogchannel channel:<#channel>', desc: 'Set the channel where automated game logs should post.' },
            { emoji: '3️⃣', cmd: '/setcashlog channel:<#channel>', desc: 'Log buy-ins, cash-outs, and chip adjustments in a staff channel.' },
            { emoji: '4️⃣', cmd: '/setrequestchannel channel:<#channel>', desc: 'Choose where /request tickets land for review.' },
            { emoji: '5️⃣', cmd: '/setupdatech channel:<#channel>', desc: 'Optional broadcast spot for bot update announcements.' },
            { emoji: '6️⃣', cmd: '/addadmin user:<@User>', desc: 'Seed your admin list, then add moderators via /addmod user:<@User>.' }
          ]}
        ]
      });
    }
  }

  if (isMod) {
    if (kittenMode) {
      sections.push({
        id: 'moderator',
        label: '🛡️ House Kittens',
        groups: [
          { label: '✉️ Requests', items: [ { emoji: '⏱️', cmd: '/requesttimer seconds:<int>', desc: 'Set how long eager Kittens wait between /request pleas.' } ] },
          { label: '🏦 House & Chips', items: [
            { emoji: '📊', cmd: '/housebalance', desc: 'Check the global vault — the house keeps score everywhere.' },
            { emoji: '➕', cmd: '/houseadd amount:<int> [reason]', desc: 'Slip fresh chips into the house coffers.' },
            { emoji: '➖', cmd: '/houseremove amount:<int> [reason]', desc: 'Pull chips out for something special.' },
            { emoji: '🎁', cmd: '/givechips user:<@> amount:<int> [reason]', desc: 'Gift chips to a deserving Kitten.' },
            { emoji: '🪙', cmd: '/buyin user:<@> amount:<int> [reason]', desc: 'Mint chips straight into a Kitten’s paws.' },
            { emoji: '🏛️', cmd: '/takechips user:<@> amount:<int> [reason]', desc: 'Collect chips back for the house.' },
            { emoji: '🔥', cmd: '/cashout user:<@> amount:<int> [reason]', desc: 'Burn chips when a Kitten cashes out.' }
          ]},
          { label: '💳 Credits', items: [
            { emoji: '🎟️', cmd: '/givecredits user:<@> amount:<int> [reason]', desc: 'Shower Credits on a playful Kitten.' },
            { emoji: '🧾', cmd: '/takecredits user:<@> amount:<int> [reason]', desc: 'Burn Credits when discipline is needed.' }
          ]}
        ]
      });
      sections.push({
        id: 'admin',
        label: '⚙️ Headmistress',
        groups: [
          { label: '🏗️ Salon Setup', items: [
            { emoji: '🗂️', cmd: '/setcasinocategory category:<#Category>', desc: 'Choose where my casino lounges live. (Admin only)' },
            { emoji: '📜', cmd: '/setgamelogchannel channel:<#channel>', desc: 'Point game logs to the proper parlor. (Admin only)' },
            { emoji: '💼', cmd: '/setcashlog channel:<#channel>', desc: 'Decide where chip and credit ledgers are whispered. (Admin only)' },
            { emoji: '📬', cmd: '/setrequestchannel channel:<#channel>', desc: 'Pick the room where requests arrive. (Admin only)' },
            { emoji: '📣', cmd: '/setupdatech channel:<#channel>', desc: 'Tell me where to preen and announce new delights. (Admin only)' }
          ]},
          { label: '🎭 Persona', items: [
            { emoji: '💋', cmd: '/kittenmode enabled:<bool>', desc: 'Invite or dismiss my sultry persona. (Admin only)' }
          ]},
          { label: '👥 Roles', items: [
            { emoji: '➕', cmd: '/addmod user:<@User>', desc: 'Crown a new house Kitten with moderator powers. (Admin only)' },
            { emoji: '➖', cmd: '/removemod user:<@User>', desc: 'Revoke those powers with a snap. (Admin only)' },
            { emoji: '👑', cmd: '/addadmin user:<@User>', desc: 'Invite someone into my inner admin circle. (Admin only)' },
            { emoji: '🗝️', cmd: '/removeadmin user:<@User>', desc: 'Dismiss an admin from that circle. (Admin only)' }
          ]},
          { label: '📊 Limits', items: [
            { emoji: '🎚️', cmd: '/setmaxbet game:<choice> amount:<int>', desc: 'Set how daring bets may be. (Admin only)' },
            { emoji: '💱', cmd: '/setrake percent:<number>', desc: 'Adjust Hold’em rake to keep the house pampered. (Admin only)' }
          ]}
        ]
      });
      sections.push({ id: 'owner', label: '👑 Proprietor', groups: [ { label: '🧹 Maintenance', items: [ { emoji: '♻️', cmd: '/resetallbalance', desc: 'Wipe every balance clean when you crave a fresh start. (Owner only)' } ] } ] });
    } else {
      sections.push({
        id: 'moderator',
        label: '🛡️ Moderator',
        groups: [
          { label: '✉️ Requests', items: [ { emoji: '⏱️', cmd: '/requesttimer seconds:<int>', desc: 'Set cooldown between /request submissions.' } ] },
          { label: '🏦 House & Chips', items: [
            { emoji: '📊', cmd: '/housebalance', desc: 'View the global house chip balance.' },
            { emoji: '➕', cmd: '/houseadd amount:<int> [reason]', desc: 'Add chips to the house.' },
            { emoji: '➖', cmd: '/houseremove amount:<int> [reason]', desc: 'Remove chips from the house.' },
            { emoji: '🎁', cmd: '/givechips user:<@> amount:<int> [reason]', desc: 'Give chips from house to player.' },
            { emoji: '🪙', cmd: '/buyin user:<@> amount:<int> [reason]', desc: 'Mint chips to a player.' },
            { emoji: '🏛️', cmd: '/takechips user:<@> amount:<int> [reason]', desc: 'Take chips to the house.' },
            { emoji: '🔥', cmd: '/cashout user:<@> amount:<int> [reason]', desc: 'Burn chips from a player.' }
          ]},
          { label: '💳 Credits', items: [
            { emoji: '🎟️', cmd: '/givecredits user:<@> amount:<int> [reason]', desc: 'Grant Credits to a player.' },
            { emoji: '🧾', cmd: '/takecredits user:<@> amount:<int> [reason]', desc: 'Burn a player’s Credits.' }
          ]}
        ]
      });
      sections.push({
        id: 'admin',
        label: '⚙️ Admin',
        groups: [
          { label: '🏗️ Setup & Channels', items: [
            { emoji: '🗂️', cmd: '/setcasinocategory category:<#Category>', desc: 'Set the casino category. (Admin only)' },
            { emoji: '📜', cmd: '/setgamelogchannel channel:<#channel>', desc: 'Set game log channel. (Admin only)' },
            { emoji: '💼', cmd: '/setcashlog channel:<#channel>', desc: 'Set cash log channel. (Admin only)' },
            { emoji: '📬', cmd: '/setrequestchannel channel:<#channel>', desc: 'Set requests channel. (Admin only)' },
            { emoji: '📣', cmd: '/setupdatech channel:<#channel>', desc: 'Set the channel for bot update announcements. (Admin only)' }
          ]},
          { label: '🎭 Personality', items: [
            { emoji: '💋', cmd: '/kittenmode enabled:<bool>', desc: 'Toggle the Kitten persona for this server. (Admin only)' }
          ]},
          { label: '👥 Roles', items: [
            { emoji: '➕', cmd: '/addmod user:<@User>', desc: 'Add a moderator. (Admin only)' },
            { emoji: '➖', cmd: '/removemod user:<@User>', desc: 'Remove a moderator. (Admin only)' },
            { emoji: '👑', cmd: '/addadmin user:<@User>', desc: 'Add an administrator. (Admin only)' },
            { emoji: '🗝️', cmd: '/removeadmin user:<@User>', desc: 'Remove an administrator. (Admin only)' }
          ]},
          { label: '📊 Limits', items: [
            { emoji: '🎚️', cmd: '/setmaxbet game:<choice> amount:<int>', desc: 'Set a game’s max bet. (Admin only)' },
            { emoji: '💱', cmd: '/setrake percent:<number>', desc: 'Hold’em rake percent (cap = table max). (Admin only)' }
          ]}
        ]
      });
      sections.push({ id: 'owner', label: '👑 Owner', groups: [ { label: '🧹 Maintenance', items: [ { emoji: '♻️', cmd: '/resetallbalance', desc: 'Reset all balances to defaults. (Owner only)' } ] } ] });
    }
  }

  const makeEmbed = (sectionId) => {
    const s = sections.find(x => x.id === sectionId) || sections[0];
    const description = kittenMode
      ? 'Select another delicious category, Kitten. Whisper `/help` again or flag a moderator if you crave more.'
      : 'Select another category from the menu to explore more tools. Need quick help? Try `/help` again or ping a moderator.';
    const e = new EmbedBuilder()
      .setTitle(`${s.label} Commands`)
      .setDescription(description)
      .setColor(0x5865F2);
    const groups = s.groups || [];
    for (const g of groups) {
      const lines = (g.items || []).map(it => {
        const decorated = it.emoji ? `${it.emoji} ${it.cmd}` : it.cmd;
        return `${decorated} — ${it.desc}`;
      }).join('\n\n');
      e.addFields({ name: g.label, value: lines || '_none_' });
    }
    return e;
  };

  const menu = new StringSelectMenuBuilder()
    .setCustomId('help|section')
    .setPlaceholder(kittenMode ? 'Choose your tease, Kitten' : 'Choose a help section')
    .addOptions(sections.map(s => ({ label: s.label, value: s.id })));
  const row = new ActionRowBuilder().addComponents(menu);
  return interaction.reply({ embeds: [makeEmbed(sections[0].id)], components: [row], ephemeral: true });
}
// Slash Command: /help — interactive help menu (player/mod/admin sections)
