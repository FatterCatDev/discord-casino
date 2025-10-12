import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { emoji } from '../lib/emojis.mjs';

export default async function handleHelpSelect(interaction, ctx) {
  const val = interaction.values[0];
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
          ? 'Earn chips with `/dailyspin`, `/vote`, `/request`, and any chip-paying game. Votes credit instantly with a DM from me; Credits burn first and chips arrive from my stash.'
          : 'Grab chips via `/dailyspin`, `/vote`, `/request`, and chip-paying games. Voting auto-credits chips (check your DMs) while games spend Credits before the house.' },
        { emoji: '🎲', cmd: 'Play Games', desc: kittenMode
          ? 'Dive into `/ridebus`, `/blackjack`, `/slots`, `/roulette`, `/dicewar`, `/holdem`, or `/horserace` for thrills.'
          : 'Try `/ridebus`, `/blackjack`, `/slots`, `/roulette`, `/dicewar`, `/holdem`, or `/horserace` to test your luck.' },
        { emoji: '🗺️', cmd: 'Find Commands', desc: kittenMode
          ? 'Peek at `/stafflist` for my caretakers; switch the menu below for mod/admin tools.'
          : 'Use `/stafflist` to see the team, then explore this menu for moderator/admin sections.' }
      ]},
      { label: '🎁 Daily & Requests', items: [
        { emoji: '🎡', cmd: '/dailyspin', desc: kittenMode
          ? 'Spin once per day for a little chip treat from me.'
          : 'Spin once every 24 hours for a free chip bonus.' },
        { emoji: '🗳️', cmd: '/vote', desc: kittenMode
          ? 'After you vote on Top.gg I credit the chips immediately and slide the receipt into your DMs.'
          : 'Vote on Top.gg; the bot auto-credits the chips and DMs you the amount.' },
        { emoji: '📨', cmd: '/request type:<Buy In|Cash Out> amount:<int>', desc: kittenMode
          ? 'Submit a buy-in or cash-out request and my staff will tend to you.'
          : 'Send buy-in/cash-out requests to the staff when you need chips moved.' }
      ]},
      { label: '🎮 Games', items: [
        { emoji: '🚌', cmd: '/ridebus bet:<int>', desc: kittenMode ? 'Ride the Bus through Q1–Q4; tease fate or cash out after Q3.' : 'Clear Q1–Q4 to win up to 10×; option to cash out after Q3.' },
        { emoji: '🃏', cmd: '/blackjack table:<High|Low> bet:<int>', desc: kittenMode ? 'Face my house in sultry blackjack — High or Low stakes.' : 'House blackjack: pick High or Low tables for different stakes.' },
        { emoji: '🎰', cmd: '/slots bet:<int>', desc: kittenMode ? 'Spin 20 lines; Credits stake first, chips are the prize.' : 'Spin a 5×3 slot with 20 lines; Credits stake first, chips pay out.' },
        { emoji: '🎡', cmd: '/roulette', desc: kittenMode ? 'Lay bets and let me spin the wheel for you, Kitten.' : 'Place your bets interactively and spin American roulette.' },
        { emoji: '⚔️', cmd: '/dicewar bet:<int>', desc: kittenMode ? 'Roll for me — any winning doubles give you double the chips.' : 'Roll against the house; winning doubles double your payout.' },
        { emoji: '♠️', cmd: '/holdem', desc: kittenMode ? 'Summon a private lounge for a Texas Hold’em table.' : 'Create a preset or custom Texas Hold’em table for your server.' },
        { emoji: '🏇', cmd: '/horserace', desc: kittenMode ? 'Wager on five flamboyant racers; change mounts between stages (for a flirty fee).' : 'Bet on a five-horse race; swap picks mid-run with a stage-based swap fee.' }
      ]}
    ]
  });

  if (isSetupAdmin) {
    sections.push({
      id: 'setup',
      label: '🛠️ Setup',
      groups: [
        { label: kittenMode ? 'Step-by-step' : 'Checklist', items: [
          { emoji: '1️⃣', cmd: '/setcasinocategory category:<#Category>', desc: kittenMode ? 'Give me a dedicated home where I can host tables.' : 'Select the category that will contain casino channels.' },
          { emoji: '2️⃣', cmd: '/setgamelogchannel channel:<#channel>', desc: kittenMode ? 'Tell me where to chronicle every thrilling game.' : 'Choose the channel for automated game logs.' },
          { emoji: '3️⃣', cmd: '/setcashlog channel:<#channel>', desc: kittenMode ? 'Pick where buy-ins, cash-outs, and chip grants are whispered.' : 'Set a channel for chip and credit transactions.' },
          { emoji: '4️⃣', cmd: '/setrequestchannel channel:<#channel>', desc: kittenMode ? 'Guide requests to the lounge your staff watches.' : 'Route /request submissions to a staffed channel.' },
          { emoji: '5️⃣', cmd: '/setupdatech channel:<#channel>', desc: kittenMode ? 'Let me purr updates in a channel of your choice.' : 'Optional channel to broadcast bot update announcements.' },
          { emoji: '6️⃣', cmd: '/addadmin user:<@User>', desc: kittenMode ? 'Crown your inner circle, then add house Kittens with /addmod.' : 'Seed your admin roster; add moderators via /addmod.' }
        ]}
      ]
    });
  }

  if (isMod) {
    if (kittenMode) {
      sections.push({
        id: 'moderator',
        label: '🛡️ House Kittens',
        groups: [
          { label: '✉️ Requests', items: [ { emoji: '⏱️', cmd: '/requesttimer seconds:<int>', desc: 'Set how long eager Kittens wait between /request pleas.' } ] },
          { label: '🏦 House & Chips', items: [
            { emoji: '📊', cmd: '/housebalance', desc: 'Check the vault — the house keeps score.' },
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
            { emoji: '📬', cmd: '/setrequestchannel channel:<#channel>', desc: 'Pick the room where requests arrive. (Admin only)' }
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
      sections.push({ id: 'moderator', label: '🛡️ Moderator', groups: [
        { label: '✉️ Requests', items: [ { emoji: '⏱️', cmd: '/requesttimer seconds:<int>', desc: 'Set cooldown between /request submissions.' } ] },
        { label: '🏦 House & Chips', items: [
          { emoji: '📊', cmd: '/housebalance', desc: 'View house chip balance.' },
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
      ]});
      sections.push({ id: 'admin', label: '⚙️ Admin', groups: [
        { label: '🏗️ Setup & Channels', items: [
          { emoji: '🗂️', cmd: '/setcasinocategory category:<#Category>', desc: 'Set the casino category. (Admin only)' },
          { emoji: '📜', cmd: '/setgamelogchannel channel:<#channel>', desc: 'Set game log channel. (Admin only)' },
          { emoji: '💼', cmd: '/setcashlog channel:<#channel>', desc: 'Set cash log channel. (Admin only)' },
          { emoji: '📬', cmd: '/setrequestchannel channel:<#channel>', desc: 'Set requests channel. (Admin only)' }
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
      ]});
      sections.push({ id: 'owner', label: '👑 Owner', groups: [ { label: '🧹 Maintenance', items: [ { emoji: '♻️', cmd: '/resetallbalance', desc: 'Reset all balances to defaults. (Owner only)' } ] } ] });
    }
  }

  const selected = sections.find(x => x.id === val) || sections[0];
  const description = kittenMode
    ? 'Select another delicious category, Kitten. Whisper `/help` again or flag a moderator if you crave more.'
    : 'Select another category from the menu to explore more tools. Need quick help? Try `/help` again or ping a moderator.';
  const embed = new EmbedBuilder()
    .setTitle(`${selected.label} Commands`)
    .setDescription(description)
    .setColor(0x5865F2);
  const groups = selected.groups || [];
  for (const g of groups) {
    const lines = (g.items || []).map(it => {
      const decorated = it.emoji ? `${it.emoji} ${it.cmd}` : it.cmd;
      return `${decorated} — ${it.desc}`;
    }).join('\n\n');
    embed.addFields({ name: g.label, value: lines || '_none_' });
  }
  return interaction.update({ embeds: [embed] });
}
// Interaction: Help select menu (switch sections)
