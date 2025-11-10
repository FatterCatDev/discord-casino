import { emoji } from './emojis.mjs';

const DEFAULT_COLOR = 0x5865F2;

export function buildHelpSections({ kittenMode = false, isMod = false, isServerAdmin = false, isBotAdmin = false } = {}) {
  const say = (kitten, normal) => (kittenMode ? kitten : normal);
  const sections = [];
  const categories = [];

  const gettingStarted = {
    id: 'getting-started',
    summary: say(
      'Start here for chips, request slips, and the staff roll call.',
      'Start here for chips, requests, and finding the staff roster.'
    ),
    label: say(`${emoji('sparkles')} Kitten Kickoff`, `${emoji('sparkles')} Getting Started`),
    menuLabel: say('Getting Started', 'Getting Started'),
    menuEmoji: '🎯',
    color: DEFAULT_COLOR,
    description: say(
      'Your opening act: learn how to claim chips, request payouts, and see who keeps the lounge glowing.',
      'Your first stop: learn how to earn chips, request payouts, and meet the staff.'
    ),
    groups: [
      {
        label: say(`${emoji('gift')} Daily Treats`, `${emoji('gift')} Daily Rewards`),
        items: [
          {
            emoji: emoji('roulette'),
            cmd: '/dailyspin',
            desc: say(
              'Spin once every 24 hours for chips — just for slipping in, Kitten.',
              'Spin once every 24 hours for a free chip bonus.'
            )
          },
          {
            emoji: emoji('ballot'),
            cmd: '/vote',
            desc: say(
              'Pop the vote links; I credit you instantly and whisper the receipt.',
              'Grab vote links; rewards auto-credit and I DM you the receipt.'
            )
          },
          {
            emoji: emoji('inbox'),
            cmd: '/request type:<Buy In|Cash Out> amount:<int>',
            desc: say(
              'Ask staff for buy-ins or cash-outs — stay sweet while they work.',
              'Submit buy-in or cash-out tickets for staff review.'
            )
          }
        ]
      },
      {
        label: say(`${emoji('map')} Know the House`, `${emoji('map')} Know the House`),
        items: [
          {
            emoji: emoji('robot'),
            cmd: '/status',
            desc: say(
              'Check my build, connection purr, and how many kittens I pamper.',
              'Check the bot version, gateway status, and global player/server counts.'
            )
          },
          {
            emoji: emoji('map'),
            cmd: '/stafflist',
            desc: say(
              'Peek at who keeps this casino sparkling and ready to help you.',
              'List the active moderators and admins for this casino.'
            )
          },
          {
            emoji: emoji('books'),
            cmd: say('Help Menu Tips', 'Help Menu Tips'),
            desc: say(
              'Use the select menu below to hop into Games, Setup, or whatever thrills you. Whisper `/help` again for a fresh splash.',
              'Use the select menu below to dive into Games, Setup, or moderation tools. Run `/help` again to return here anytime.'
            )
          }
        ]
      }
    ]
  };
  categories.push(gettingStarted);

  const games = {
    id: 'games',
    summary: say(
      'Tour every casino thrill and how to launch it.',
      'Tour every casino game and how to launch it.'
    ),
    label: say(`${emoji('videoGame')} Kitten’s Game Floor`, `${emoji('videoGame')} Games`),
    menuLabel: say('Games', 'Games'),
    menuEmoji: emoji('videoGame'),
    color: DEFAULT_COLOR,
    description: say(
      'Credits stake first, chips rain on wins. Pick your poison and I’ll spin it up.',
      'Credits spend first, chips pay out on wins. Pick a game and start the action.'
    ),
    groups: [
      {
        label: say(`${emoji('dice')} Featured Tables`, `${emoji('dice')} Featured Tables`),
        items: [
          {
            emoji: emoji('bus'),
            cmd: '/ridebus bet:<int>',
            desc: say(
              'Ride through Q1–Q4, flirt with fate, or cash out after Q3.',
              'Clear Q1–Q4 to win up to 10×; cash out after Q3 if you want safety.'
            )
          },
          {
            emoji: emoji('chipAce'),
            cmd: '/blackjack table:<High|Low> bet:<int>',
            desc: say(
              'Face my house — pick High or Low stakes for your thrill.',
              'Take on the house; choose High or Low tables for different stakes.'
            )
          },
          {
            emoji: emoji('slots'),
            cmd: '/slots bet:<int>',
            desc: say(
              'Spin 20 shimmering lines; Credits stake first, chips drop when you win.',
              'Spin a 5×3 slot (20 lines). Credits stake first; chips pay out.'
            )
          },
          {
            emoji: emoji('roulette'),
            cmd: '/roulette',
            desc: say(
              'Place your bets then let me tease the wheel.',
              'Set your bets interactively and spin American roulette.'
            )
          },
          {
            emoji: emoji('diceWar'),
            cmd: '/dicewar bet:<int>',
            desc: say(
              'Roll for me; any winning doubles double your payout.',
              'Roll versus the house. Winning doubles double your chips.'
            )
          },
          {
            emoji: emoji('holdem'),
            cmd: '/holdem',
            desc: say(
              'Summon a private lounge for Texas Hold’em with friends.',
              'Create a private or preset Texas Hold’em table for your server.'
            )
          },
          {
            emoji: emoji('horseRace'),
            cmd: '/horserace',
            desc: say(
              'Bet on my five racers; swap mounts between stages for a cheeky fee.',
              'Bet on a five-horse sprint; swap picks each stage with a small fee.'
            )
          }
        ]
      },
      {
        label: say(`${emoji('trophy')} Champion Perks`, `${emoji('trophy')} Champion Perks`),
        items: [
          {
            emoji: '🎱',
            cmd: '/8ball question:<text?>',
            desc: say(
              'Only the reigning #1 High Roller may ask me for a yes/no omen in public.',
              'Only the #1 High Roller can command the 8-ball for yes/no/maybe guidance.'
            )
          }
        ]
      }
    ]
  };
  categories.push(games);

  const jobs = {
    id: 'jobs',
    summary: say(
      'Clock shifts for XP, chip bonuses, and kitten titles — stamina fuels every run.',
      'Clock shifts to earn XP, chip bonuses, and new ranks. Manage your stamina to keep working.'
    ),
    label: say(`${emoji('briefcase')} Kitten Careers`, `${emoji('briefcase')} Job System`),
    menuLabel: say('Jobs', 'Jobs'),
    menuEmoji: '💼',
    color: DEFAULT_COLOR,
    description: say(
      'Each shift is a single quick challenge. Spend stamina to chain up to five back-to-back, then rest those paws for six hours.',
      'Each shift is a single quick challenge. Stamina refills every few hours while you’re below cap, so pace your streaks.'
    ),
    groups: [
      {
        label: say(`${emoji('sparkles')} Clock In`, `${emoji('sparkles')} Clock In`),
        items: [
          {
            emoji: emoji('clipboard'),
            cmd: '/job',
            desc: say(
              'Open the career board to preview roles, streak status, and your current stamina.',
              'Open the job board to preview roles, streak status, and available stamina.'
            )
          },
          {
            emoji: emoji('sparkles'),
            cmd: '/job start job:<id>',
            desc: say(
              'Pick a role and tackle a one-stage shift for XP, streak rewards, and chip payouts — stamina required.',
              'Pick a role and tackle a one-stage shift for XP, streak rewards, and chip payouts. Each shift spends stamina.'
            )
          },
          {
            emoji: emoji('stopSign'),
            cmd: '/job cancel',
            desc: say(
              'Bail out of your active shift before the finale if something comes up (stamina is refunded).',
              'Cancel an active shift early if you need to step away; your stamina charge comes back.'
            )
          }
        ]
      },
      {
        label: say(`${emoji('books')} Progress & Reports`, `${emoji('books')} Progress & Reports`),
        items: [
          {
            emoji: emoji('chartUp'),
            cmd: '/job stats [user]',
            desc: say(
              'See XP, ranks, stamina timers, and recent shift logs for yourself or a tagged kitten.',
              'Review XP, ranks, stamina timers, and recent shift logs for yourself or another player.'
            )
          },
          {
            emoji: emoji('gift'),
            cmd: say('Shift Rewards', 'Shift Rewards'),
            desc: say(
              'Performance payouts scale with rank tiers — higher streaks mean sweeter chip bonuses.',
              'Performance payouts scale with rank tiers — streaks boost the chip bonuses you take home.'
            )
          }
        ]
      },
      {
        label: say(`${emoji('hourglassFlow')} Shift Rules`, `${emoji('hourglassFlow')} Shift Rules`),
        items: [
          {
            emoji: emoji('timer'),
            cmd: say('Burst Limit', 'Burst Limit'),
            desc: say(
              'Run up to five shifts in a burst; stamina then forces a six-hour recharge.',
              'Complete up to five shifts before stamina kicks off a six-hour recharge.'
            )
          },
          {
            emoji: emoji('map'),
            cmd: say('Stage Flow', 'Stage Flow'),
            desc: say(
              'Each shift has one interactive scene; miss the timer and the run flops, ending the streak.',
              'Each shift has one interactive scene; timing out ends the run and breaks the streak.'
            )
          }
        ]
      }
    ]
  };
  categories.push(jobs);

  const cartel = {
    id: 'semuta-cartel',
    summary: say(
      'Master the Semuta passive flow—invest shares, sell stash, and keep your runners paid.',
      'Master the Semuta cartel loop—invest shares, sell stash, and keep dealers paid.'
    ),
    label: `${emoji('semuta_cartel')} Semuta Cartel`,
    menuLabel: say('Semuta Cartel', 'Semuta Cartel'),
    menuEmoji: emoji('semuta_cartel'),
    color: DEFAULT_COLOR,
    description: say(
      'Open `/cartel` to watch your stash, warehouse, and dealer empire grow—every button on that board drives the passive income machine.',
      'Use `/cartel` to monitor stash, warehouse, and dealer production—the buttons on that board control the entire passive income system.'
    ),
    groups: [
      {
        label: say(`${emoji('newspaper')} Overview & Shares`, `${emoji('newspaper')} Overview & Shares`),
        items: [
          {
            emoji: emoji('semuta'),
            cmd: '/cartel',
            desc: say(
              'Summon the Semuta dashboard with buttons for investing, selling stash, collecting warehouse chips, dealers, and ranks.',
              'Opens the Semuta dashboard with buttons for investing, selling stash, collecting warehouse chips, dealers, and ranks.'
            )
          },
          {
            emoji: emoji('sparkles'),
            cmd: 'Invest button (inside /cartel)',
            desc: say(
              'Pop the modal to buy shares at your guild’s live price; more shares mean faster Semuta ticks.',
              'Opens a modal to buy shares at the current guild price; more shares boost Semuta production.'
            )
          },
          {
            emoji: emoji('flask'),
            cmd: 'Sell Stash button (inside /cartel)',
            desc: say(
              'Turn stored grams of Semuta into chips by entering an amount or typing ALL.',
              'Convert stash grams of Semuta into chips—enter an amount or type ALL.'
            )
          },
          {
            emoji: emoji('banknotes'),
            cmd: 'Collect Warehouse button (inside /cartel)',
            desc: say(
              'Empty overflow Semuta into chips once the warehouse fills up.',
              'Move warehouse overflow into chips whenever you’re ready.'
            )
          }
        ]
      },
      {
        label: say(`${emoji('dealers')} Dealers & Upkeep`, `${emoji('dealers')} Dealers & Upkeep`),
        items: [
          {
            emoji: emoji('dealers'),
            cmd: 'Dealers button (inside /cartel)',
            desc: say(
              'Swap between List, Hire, and Upkeep tabs to recruit, rename, or fire your distributors.',
              'Switch between List, Hire, and Upkeep tabs to recruit, manage, or fire dealers.'
            )
          },
          {
            emoji: emoji('cashStack'),
            cmd: 'Collect Chips button (Dealers view)',
            desc: say(
              'Claims every dealer’s pending chip payout and grants cartel XP.',
              'Collects all pending dealer chips at once and awards cartel XP.'
            )
          },
          {
            emoji: emoji('alarmClock'),
            cmd: 'Upkeep buttons (Dealers view)',
            desc: say(
              'Settle overdue routes right from the embed—enter any chip amount to buy more time.',
              'Pay upkeep directly from the embed—enter chip amounts to extend dealer routes.'
            )
          }
        ]
      },
      {
        label: say(`${emoji('trophy')} Ranks & Mods`, `${emoji('trophy')} Ranks & Moderation`),
        items: [
          {
            emoji: emoji('medalGold'),
            cmd: 'Ranks button (inside /cartel)',
            desc: say(
              'View the XP ladder, see where you sit, and plan the grind to unlock more dealer slots.',
              'Shows the XP ladder, highlighting your current rank so you know what’s next.'
            )
          }
        ]
      }
    ]
  };
  categories.push(cartel);

  if (isServerAdmin || isBotAdmin) {
    categories.push({
      id: 'server-admins',
      summary: say(
        'Wire up channels, logs, and access before the crowds rush in.',
        'Wire up categories, logs, and access so the casino runs smoothly.'
      ),
      label: `${emoji('hammerWrench')} Server Admins`,
      menuLabel: 'Server Admins',
      menuEmoji: '🛠',
      color: DEFAULT_COLOR,
      description: say(
        'Lay the foundation so every lounge, log, and request flows like velvet.',
        'Configure the casino category plus log channels so commands land exactly where they should.'
      ),
      groups: [
        {
          label: say('Step-by-step', 'Checklist'),
          items: [
            {
              emoji: emoji('keycap1'),
              cmd: '/setcasinocategory category:<#Category>',
              desc: say(
                'Give me a dedicated home where I can host tables without interruptions.',
                'Select the category that will contain casino channels.'
              )
            },
            {
              emoji: emoji('keycap2'),
              cmd: '/setgamelogchannel channel:<#channel>',
              desc: say(
                'Tell me where to chronicle every thrilling game.',
                'Choose the channel for automated game logs.'
              )
            },
            {
              emoji: emoji('keycap3'),
              cmd: '/setcashlog channel:<#channel>',
              desc: say(
                'Pick the ledger room for buy-ins, cash-outs, and chip grants.',
                'Set a channel for chip and credit transactions.'
              )
            },
            {
              emoji: emoji('keycap4'),
              cmd: '/setupdatech channel:<#channel>',
              desc: say(
                'Optional: send my update purrs to a spotlight channel.',
                'Optional: channel for update announcements.'
              )
            }
          ]
        },
      ]
    });
  }

  if (isMod || isBotAdmin) {
    categories.push({
      id: 'moderation',
      summary: say(
        'Keep chips flowing, requests tidy, and kittens content.',
        'Manage chip flow, requests, and casino balance.'
      ),
      label: say(`${emoji('shield')} House Kittens`, `${emoji('shield')} Moderation`),
      menuLabel: say('Moderation', 'Moderation'),
      menuEmoji: '🛡',
      color: DEFAULT_COLOR,
      description: say(
        'Every tool you need to pamper players and mind the vault.',
        'Tools for handling chip transfers, cooldowns, and the house balance.'
      ),
      groups: [
        {
          label: say(`${emoji('requestEnvelope')} Requests`, `${emoji('requestEnvelope')} Requests`),
          items: [
            {
              emoji: emoji('timer'),
              cmd: '/requesttimer seconds:<int>',
              desc: say(
                'Set how long eager kittens wait between /request pleas.',
                'Set the cooldown between /request submissions.'
              )
            }
          ]
        },
        {
          label: say(`${emoji('vault')} House & Chips`, `${emoji('vault')} House & Chips`),
          items: [
            {
              emoji: emoji('chartUp'),
              cmd: '/housebalance',
              desc: say(
                'Peek at the global vault — the house keeps score everywhere.',
                'View the global house chip balance.'
              )
            },
            {
              emoji: emoji('plus'),
              cmd: '/houseadd amount:<int> [reason]',
              desc: say(
                'Slip fresh chips into the house coffers.',
                'Add chips to the house.'
              )
            },
            {
              emoji: emoji('minus'),
              cmd: '/houseremove amount:<int> [reason]',
              desc: say(
                'Pull chips out for something special.',
                'Remove chips from the house.'
              )
            },
            {
              emoji: emoji('gift'),
              cmd: '/givechips user:<@> amount:<int> [reason]',
              desc: say(
                'Gift chips to a deserving kitten.',
                'Give chips from the house to a player.'
              )
            },
            {
              emoji: emoji('coin'),
              cmd: '/buyin user:<@> amount:<int> [reason]',
              desc: say(
                'Mint chips straight into a kitten’s paws.',
                'Mint chips to a player.'
              )
            },
            {
              emoji: emoji('parthenon'),
              cmd: '/takechips user:<@> amount:<int> [reason]',
              desc: say(
                'Collect chips back for the house.',
                'Take chips back to the house.'
              )
            },
            {
              emoji: emoji('fire'),
              cmd: '/cashout user:<@> amount:<int> [reason]',
              desc: say(
                'Burn chips when a kitten cashes out.',
                'Burn chips from a player.'
              )
            }
          ]
        },
        {
          label: say(`${emoji('creditCard')} Credits`, `${emoji('creditCard')} Credits`),
          items: [
            {
              emoji: emoji('ticket'),
              cmd: '/givecredits user:<@> amount:<int> [reason]',
              desc: say(
                'Shower Credits on a playful kitten.',
                'Grant Credits to a player.'
              )
            },
            {
              emoji: emoji('receipt'),
              cmd: '/takecredits user:<@> amount:<int> [reason]',
              desc: say(
                'Burn Credits when discipline is needed.',
                'Burn a player’s Credits.'
              )
            }
          ]
        }
      ]
    });
  }

  if (isBotAdmin) {
    categories.push({
      id: 'admin',
      summary: say(
        'Fine-tune roles, personas, and game rules.',
        'Fine-tune roles, persona toggles, and game limits.'
      ),
      label: say(`${emoji('gear')} Headmistress`, `${emoji('gear')} Admin`),
      menuLabel: say('Admin', 'Admin'),
      menuEmoji: '⚙️',
      color: DEFAULT_COLOR,
      description: say(
        'Shape the casino’s personality, roles, and table limits exactly how you like.',
        'Tune the casino’s configuration, roles, and table limits.'
      ),
      groups: [
        {
          label: say(`${emoji('theater')} Persona`, `${emoji('theater')} Personality`),
          items: [
            {
              emoji: emoji('kiss'),
              cmd: '/kittenmode enabled:<bool>',
              desc: say(
                'Invite or dismiss my sultry persona. (Admin only)',
                'Toggle the Kitten persona. (Admin only)'
              )
            }
          ]
        },
        {
          label: say(`${emoji('semuta_cartel')} Semuta Cartel`, `${emoji('semuta_cartel')} Semuta Cartel`),
          items: [
            {
              emoji: emoji('hammerWrench'),
              cmd: '/setcartelshare • /setcartelrate • /setcartelxp • /cartelreset',
              desc: say(
                'Admins only: tune share price/output, adjust XP per gram of Semuta, or reset a player if needed.',
                'Admins only: tune share price and rate, change XP per gram of Semuta, or reset a player’s cartel profile.'
              )
            }
          ]
        },
        {
          label: say(`${emoji('busts')} Roles`, `${emoji('busts')} Roles`),
          items: [
            {
              emoji: emoji('plus'),
              cmd: '/addmod user:<@User>',
              desc: say(
                'Crown a new house kitten with moderator powers. (Admin only)',
                'Add a moderator. (Admin only)'
              )
            },
            {
              emoji: emoji('minus'),
              cmd: '/removemod user:<@User>',
              desc: say(
                'Revoke those powers with a snap. (Admin only)',
                'Remove a moderator. (Admin only)'
              )
            },
            {
              emoji: emoji('crown'),
              cmd: '/addadmin user:<@User>',
              desc: say(
                'Invite someone into my inner admin circle. (Admin only)',
                'Add an administrator. (Admin only)'
              )
            },
            {
              emoji: emoji('key'),
              cmd: '/removeadmin user:<@User>',
              desc: say(
                'Dismiss an admin from that circle. (Admin only)',
                'Remove an administrator. (Admin only)'
              )
            }
          ]
        },
        {
          label: say(`${emoji('requestEnvelope')} Intake`, `${emoji('requestEnvelope')} Requests Intake`),
          items: [
            {
              emoji: emoji('mailbox'),
              cmd: '/setrequestchannel channel:<#channel>',
              desc: say(
                'Inside my primary guild only: choose the lounge where every /request lands. (Bot admin only)',
                'Inside the primary guild only: set the intake channel for buy-in, cash-out, and erasure requests. (Bot admin only)'
              )
            }
          ]
        },
        {
          label: say(`${emoji('books')} Job Controls`, `${emoji('books')} Job Controls`),
          items: [
            {
              emoji: emoji('timer'),
              cmd: '/job reset user:<@User>',
              desc: say(
                'Clear a kitten’s stamina cooldown so they can sprint another burst. (Admin only)',
                'Clear a player’s stamina cooldown so they can run a fresh burst. (Admin only)'
              )
            },
            {
              emoji: emoji('sparkles'),
              cmd: '/job resetstats user:<@User>',
              desc: say(
                'Reset a kitten’s ranks, XP, and streaks across every role. (Admin only)',
                'Reset ranks, XP, and streaks across every job. (Admin only)'
              )
            }
          ]
        },
        {
          label: say(`${emoji('chartUp')} Limits`, `${emoji('chartUp')} Limits`),
          items: [
            {
              emoji: emoji('slider'),
              cmd: '/setmaxbet game:<choice> amount:<int>',
              desc: say(
                'Set how daring the tables may be. (Admin only)',
                'Set a game’s max bet. (Admin only)'
              )
            },
            {
              emoji: emoji('currencyExchange'),
              cmd: '/setrake percent:<number>',
              desc: say(
                'Adjust Hold’em rake to keep the house pampered. (Admin only)',
                'Adjust the Hold’em rake percent. (Admin only)'
              )
            }
          ]
        }
      ]
    });

    categories.push({
      id: 'owner',
      summary: say(
        'Nuclear options for a spotless ledger.',
        'High-impact maintenance commands.'
      ),
      label: say(`${emoji('proprietor')} Proprietor`, `${emoji('proprietor')} Owner`),
      menuLabel: say('Proprietor', 'Owner'),
      menuEmoji: '👑',
      color: DEFAULT_COLOR,
      description: say(
        'Only touch this when you crave a pristine slate.',
        'Owner-level reset tools. Handle with care.'
      ),
      groups: [
        {
          label: say(`${emoji('broom')} Maintenance`, `${emoji('broom')} Maintenance`),
          items: [
            {
              emoji: emoji('recycle'),
              cmd: '/resetallbalance',
              desc: say(
                'Wipe every balance clean when you thirst for a fresh start. (Owner only)',
                'Reset all balances to defaults. (Owner only)'
              )
            }
          ]
        }
      ]
    });
  }

  const overviewItems = categories.map(section => ({
    emoji: section.menuEmoji || null,
    cmd: section.menuLabel || section.label,
    desc:
      section.summary ||
      say(
        'Select this playbook in the menu below to see every detail.',
        'Select this category in the menu below to see every detail.'
      )
  }));

  const overview = {
    id: 'overview',
    summary: say(
      'Pick a flavor below and I’ll open your cheat sheet.',
      'Pick a category below to open a detailed cheat sheet.'
    ),
    label: say(`${emoji('sparkles')} Choose Your Cheat Sheet`, `${emoji('books')} Help Overview`),
    menuLabel: say('Overview', 'Overview'),
    menuEmoji: '📖',
    color: DEFAULT_COLOR,
    description: say(
      'Tap the menu below and I’ll reveal everything you need.',
      'Use the menu below to jump into the guide you need.'
    ),
    groups: [
      {
        label: say(`${emoji('map')} Categories`, `${emoji('map')} Categories`),
        items: overviewItems
      },
      {
        label: say(`${emoji('sparkles')} Quick Commands`, `${emoji('sparkles')} Quick Commands`),
        items: [
          {
            emoji: emoji('chips'),
            cmd: '/balance',
            desc: say(
              'Peek at your chips and credits before you wager, Kitten.',
              'Check your current chips and credits balance.'
            )
          },
          {
            emoji: emoji('gift'),
            cmd: '/dailyspin',
            desc: say(
              'Grab your free daily spin — it resets every 24 hours.',
              'Claim a free chip spin once every 24 hours.'
            )
          },
          {
            emoji: emoji('robot'),
            cmd: '/status',
            desc: say(
              'See my status, build, and how many kittens I’m entertaining.',
              'View bot status, version, and global player counts.'
            )
          }
        ]
      }
    ],
    footer: say(
      'Need a reset? Choose Overview in the menu anytime.',
      'Select Overview in the menu anytime to return here.'
    )
  };

  sections.push(overview, ...categories);
  return sections;
}
