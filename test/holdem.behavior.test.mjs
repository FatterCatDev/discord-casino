import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as holdem from '../src/games/holdem.mjs';
import { databaseCalls, databaseFakes, resetDatabaseFakes } from './support/database.mjs';

const rules = holdem.__characterization__;

function seat(userId, overrides = {}) {
  return { ...holdem.emptySeat(userId, 100), inHand: true, actedRound: false, ...overrides };
}

function table(overrides = {}) {
  return {
    guildId: 'guild', channelId: 'channel', hostId: 'host',
    phase: 'PREFLOP', sb: 5, bb: 10, min: 20, max: 500, cap: 9,
    buttonIndex: 0, toAct: 0, currentBet: 0, minRaise: 10, pot: 0,
    board: [], burned: [], deck: ['2♣', '3♦', '4♥', '5♠', '6♣', '7♦', '8♥', '9♠'],
    seats: [seat('alice'), seat('bob'), seat('carol')],
    ...overrides
  };
}

function registerTable(t, state) {
  const key = holdem.tableKey(state.guildId, state.channelId);
  holdem.holdemTables.set(key, state);
  t.after(() => {
    holdem.holdemTables.clear();
    resetDatabaseFakes();
  });
}

function fakeClient() {
  const notices = [];
  return {
    notices,
    channels: {
      fetch: async () => ({
        isTextBased: () => true,
        send: async payload => { notices.push(payload); return { id: 'notice' }; },
        messages: {
          fetch: async () => ({
            edit: async payload => { notices.push(payload); },
            delete: async () => {}
          })
        }
      })
    }
  };
}

function interaction(state, userId, customId = '') {
  const replies = [];
  return {
    guild: { id: state.guildId }, channelId: state.channelId,
    user: { id: userId }, customId, client: fakeClient(), replies,
    isButton: () => false,
    reply: async payload => { replies.push(payload); return payload; },
    update: async payload => { replies.push(payload); return payload; }
  };
}

function captureTimers(t) {
  const timers = [];
  t.mock.method(Date, 'now', () => 1_700_000_000_000);
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    const timer = { callback, delay, cleared: false };
    timers.push(timer);
    return timer;
  });
  t.mock.method(globalThis, 'clearTimeout', timer => { timer.cleared = true; });
  return timers;
}

test('holdem: public facade exports and registry identity are stable', t => {
  assert.deepEqual(Object.keys(holdem).filter(name => name !== '__characterization__').sort(), [
    'buildTableEmbed', 'emptySeat', 'ensureTableInChannel', 'holdemTables',
    'hostTable', 'joinTable', 'leaveTable', 'listTables', 'onHoldemBetModal',
    'onHoldemButton', 'onHoldemCustomModal', 'onHoldemJoinModal', 'rebuyAtTable',
    'setTableRake', 'startHand', 'tableButtons', 'tableKey'
  ].sort());
  const state = table();
  registerTable(t, state);
  assert.equal(holdem.tableKey('guild', 'channel'), 'guild:channel');
  assert.equal(holdem.ensureTableInChannel('guild', 'channel'), state);
  assert.equal(holdem.ensureTableInChannel('guild', 'missing'), null);
});

test('holdem: seat construction has independent mutable hole-card arrays', () => {
  const first = holdem.emptySeat('alice', 50);
  assert.deepEqual(first, {
    userId: 'alice', stack: 50, inHand: false, committed: 0, betRound: 0,
    folded: false, allIn: false, hole: []
  });
  assert.notEqual(first.hole, holdem.emptySeat('bob').hole);
});

test('holdem: deck contains 52 unique string cards using T and symbolic suits', t => {
  const random = t.mock.method(crypto, 'randomInt', limit => limit - 1);
  const deck = rules.makeDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck).size, 52);
  assert.equal(deck[0], '2♣');
  assert.equal(deck[51], 'A♠');
  assert.ok(deck.includes('T♥'));
  assert.ok(deck.every(card => /^[2-9TJQKA][♣♦♥♠]$/u.test(card)));
  assert.deepEqual(random.mock.calls.map(call => call.arguments[0]),
    Array.from({ length: 51 }, (_, index) => 52 - index));
});

const rankedHands = [
  ['high card', ['A♠', 'J♦', '9♣', '7♥', '5♠', '3♦', '2♣'], 0],
  ['pair', ['A♠', 'A♦', '9♣', '7♥', '5♠', '3♦', '2♣'], 1],
  ['two pair', ['A♠', 'A♦', '9♣', '9♥', '5♠', '3♦', '2♣'], 2],
  ['trips', ['A♠', 'A♦', 'A♣', '7♥', '5♠', '3♦', '2♣'], 3],
  ['straight', ['A♠', 'K♦', 'Q♣', 'J♥', 'T♠', '3♦', '2♣'], 4],
  ['flush', ['A♠', 'J♠', '9♠', '7♠', '5♠', '3♦', '2♣'], 5],
  ['full house', ['A♠', 'A♦', 'A♣', '7♥', '7♠', '3♦', '2♣'], 6],
  ['quads', ['A♠', 'A♦', 'A♣', 'A♥', '5♠', '3♦', '2♣'], 7],
  ['straight flush', ['A♠', 'K♠', 'Q♠', 'J♠', 'T♠', '3♦', '2♣'], 8]
];
for (const [name, cards, category] of rankedHands) {
  test(`holdem: evaluates ${name} with the existing result shape`, () => {
    const result = rules.evaluate7(cards);
    assert.equal(result.cat, category);
    assert.ok(Array.isArray(result.ranks));
    assert.equal(typeof result.label, 'string');
    if (category > 0) {
      assert.ok(rules.compareHands(result, rules.evaluate7(rankedHands[category - 1][1])) > 0);
    }
  });
}

test('holdem: ace-low straights, board ties, and pair kickers retain ordering', () => {
  const wheel = rules.evaluate7(['A♠', '2♦', '3♣', '4♥', '5♠', '9♦', 'K♣']);
  assert.equal(wheel.cat, 4);
  assert.deepEqual(wheel.ranks, [5, 4, 3, 2, 14]);
  const board = ['A♠', 'K♠', 'Q♠', 'J♠', 'T♠'];
  assert.equal(rules.compareHands(
    rules.evaluate7([...board, '2♦', '3♣']),
    rules.evaluate7([...board, '7♦', '8♣'])
  ), 0);
  assert.ok(rules.compareHands(
    rules.evaluate7(['A♠', 'A♦', 'K♣', '9♥', '7♠', '4♦', '2♣']),
    rules.evaluate7(['A♠', 'A♦', 'Q♣', '9♥', '7♠', '4♦', '2♣'])
  ) > 0);
});

test('holdem characterization: overlapping straight runs currently choose the lower run', () => {
  const result = rules.evaluate7(['9♠', '8♦', '7♣', '6♥', '5♠', '4♦', '2♣']);
  assert.equal(result.cat, 4);
  assert.deepEqual(result.ranks, [8, 7, 6, 5, 4]);
});

test('holdem: checks require matching the bet; calls conserve stack plus pot', async () => {
  const state = table({ currentBet: 10, pot: 10 });
  await rules.doCheck(state);
  assert.equal(state.seats[0].actedRound, false);
  await rules.doCall(state);
  assert.equal(state.seats[0].stack, 90);
  assert.equal(state.seats[0].betRound, 10);
  assert.equal(state.seats[0].committed, 10);
  assert.equal(state.pot, 20);
  assert.equal(state.seats[0].actedRound, true);
  await rules.doCheck(state);
  assert.equal(state.seats[0].stack, 90);
});

test('holdem: short calls become all-in and cannot spend beyond the stack', async () => {
  const state = table({ currentBet: 10, seats: [seat('alice', { stack: 4 }), seat('bob')] });
  await rules.doCall(state);
  assert.deepEqual(
    [state.seats[0].stack, state.seats[0].committed, state.seats[0].allIn, state.pot],
    [0, 4, true, 4]
  );
});

test('holdem: invalid raises leave state unchanged and full raises set the minimum', async () => {
  const state = table({ currentBet: 10 });
  const before = structuredClone(state);
  for (const amount of [-1, 0, 1.5, 10, 19]) {
    assert.equal(await rules.doBetOrRaise(state, amount), false);
    assert.deepEqual(state, before);
  }
  assert.equal(await rules.doBetOrRaise(state, 25), true);
  assert.deepEqual(
    [state.currentBet, state.minRaise, state.seats[0].stack, state.pot],
    [25, 15, 75, 25]
  );
});

test('holdem: opening bets require the big blind; partial all-ins retain minRaise', async () => {
  const state = table();
  assert.equal(await rules.doBetOrRaise(state, 9), false);
  assert.equal(await rules.doBetOrRaise(state, 10), true);
  const short = table({ currentBet: 10, minRaise: 10, seats: [seat('alice', { stack: 14 })] });
  assert.equal(await rules.doBetOrRaise(short, 14), true);
  assert.deepEqual([short.currentBet, short.minRaise, short.pot, short.seats[0].allIn],
    [14, 10, 14, true]);
});

test('holdem: unmatched contributions refund stack, commitment, and displayed bet', () => {
  const state = table({
    currentBet: 50, pot: 80,
    seats: [
      seat('alice', { stack: 50, committed: 50, betRound: 50 }),
      seat('bob', { stack: 70, committed: 30, betRound: 30 })
    ]
  });
  assert.equal(rules.refundUncalledBet(state), 20);
  assert.deepEqual([state.pot, state.currentBet, state.seats[0].stack,
    state.seats[0].committed, state.seats[0].betRound], [60, 30, 70, 30, 30]);
  assert.equal(rules.refundUncalledBet(state), 0);
});

test('holdem: folding to one player completes the hand with the existing payout shape', async () => {
  const state = table({ pot: 30, seats: [seat('alice'), seat('bob')] });
  await rules.doFold(state);
  const result = rules.afterActionMaybeAdvance(state);
  assert.deepEqual(result, {
    winners: [1], label: 'Hand ends — Everyone else folded',
    payouts: [{ idx: 1, amount: 30 }]
  });
  assert.deepEqual([state.phase, state.pot, state.seats[1].stack], ['COMPLETE', 0, 130]);
});

test('holdem: completed betting burns a card, deals the flop, and resets street bets', () => {
  const state = table({
    currentBet: 10, pot: 30,
    seats: ['alice', 'bob', 'carol'].map(id => seat(id, {
      stack: 90, committed: 10, betRound: 10, actedRound: true
    }))
  });
  assert.equal(rules.afterActionMaybeAdvance(state), null);
  assert.equal(state.phase, 'FLOP');
  assert.deepEqual(state.burned, ['9♠']);
  assert.deepEqual(state.board, ['8♥', '7♦', '6♣']);
  assert.equal(state.currentBet, 0);
  assert.equal(state.toAct, 2);
  assert.ok(state.seats.every(player => player.betRound === 0 && !player.actedRound));
});

test('holdem: side pots include folded contributions but exclude folded winners', () => {
  const state = table({
    phase: 'RIVER', pot: 250, rakeBps: 500, rakeCap: 7,
    board: ['2♣', '5♦', '8♥', '9♠', 'J♣'],
    seats: [
      seat('alice', { stack: 0, committed: 50, hole: ['A♠', 'A♦'] }),
      seat('bob', { stack: 0, committed: 100, hole: ['K♠', 'K♦'] }),
      seat('carol', { stack: 0, committed: 100, folded: true, hole: ['J♠', 'J♦'] })
    ]
  });
  const result = rules.showdown(state);
  assert.equal(result.rake, 7);
  assert.deepEqual(result.payouts, [{ idx: 0, amount: 143 }, { idx: 1, amount: 100 }]);
  assert.deepEqual(result.pots, [
    { amount: 143, winners: [{ idx: 0, amount: 143 }] },
    { amount: 100, winners: [{ idx: 1, amount: 100 }] }
  ]);
  assert.equal(state.seats.reduce((sum, player) => sum + player.stack, result.rake), 250);
  assert.equal(state.phase, 'COMPLETE');
  assert.equal(state.pot, 0);
});

test('holdem: one odd chip in a tied pot goes to the winner after the button', () => {
  const state = table({
    pot: 15, board: ['A♠', 'K♠', 'Q♠', 'J♠', 'T♠'],
    seats: [
      seat('alice', { stack: 0, committed: 5, hole: ['2♦', '3♦'] }),
      seat('bob', { stack: 0, committed: 5, hole: ['4♦', '5♦'] }),
      seat('carol', { stack: 0, committed: 5, folded: true, hole: ['6♦', '7♦'] })
    ]
  });
  assert.deepEqual(rules.showdown(state).payouts, [{ idx: 0, amount: 7 }, { idx: 1, amount: 8 }]);
});

test('holdem characterization: preflop all-in runout currently stops at four board cards', () => {
  const state = table({
    pot: 20,
    seats: [
      seat('alice', { stack: 0, allIn: true, committed: 10, hole: ['A♠', 'A♦'] }),
      seat('bob', { stack: 0, allIn: true, committed: 10, hole: ['K♠', 'K♦'] })
    ]
  });
  const result = rules.afterActionMaybeAdvance(state);
  assert.equal(state.board.length, 4);
  assert.equal(state.burned.length, 2);
  assert.equal(state.phase, 'COMPLETE');
  assert.equal(result.payouts.reduce((sum, payout) => sum + payout.amount, 0), 20);
});

test('holdem: table controls preserve lobby and in-hand custom IDs', () => {
  const state = table({ phase: 'LOBBY' });
  const ids = () => holdem.tableButtons(state).toJSON().components.map(button => button.custom_id);
  assert.deepEqual(ids(), ['hold|join', 'hold|leave', 'hold|start|host', 'hold|sitout', 'hold|sitin']);
  state.phase = 'FLOP';
  assert.deepEqual(ids(), ['hold|join', 'hold|leave', 'hold|peek', 'hold|sitout', 'hold|sitin']);
});

test('holdem: peeking is private and rejects spectators without exposing hole cards', async t => {
  const state = table({ seats: [seat('alice', { hole: ['A♠', 'K♦'] }), seat('bob')] });
  registerTable(t, state);
  const player = interaction(state, 'alice', 'hold|peek');
  await holdem.onHoldemButton(player, {});
  assert.equal(player.replies[0].ephemeral, true);
  assert.match(player.replies[0].embeds[0].toJSON().description, /A.*K/);
  const spectator = interaction(state, 'spectator', 'hold|peek');
  await holdem.onHoldemButton(spectator, {});
  assert.equal(spectator.replies[0].ephemeral, true);
  assert.equal(spectator.replies[0].embeds, undefined);
});

test('holdem: a wrong-turn action does not mutate state or write to persistence', async t => {
  const state = table();
  registerTable(t, state);
  const before = structuredClone(state);
  const click = interaction(state, 'bob', 'hold|act|call|alice');
  await holdem.onHoldemButton(click, {});
  assert.match(click.replies[0].content, /Not your turn/);
  assert.deepEqual(state, before);
  assert.deepEqual(databaseCalls, []);
});

test('holdem: joining checks chips before escrow and owns a ten-minute lobby timer', async t => {
  const state = table({ phase: 'LOBBY', seats: [] });
  registerTable(t, state);
  const timers = captureTimers(t);
  databaseFakes.set('getUserBalances', async () => ({ chips: 100 }));
  databaseFakes.set('escrowAdd', async () => ({ escrow: 50 }));
  await holdem.joinTable(interaction(state, 'alice'), {}, 50);
  assert.deepEqual(databaseCalls, [
    { name: 'getUserBalances', args: ['guild', 'alice'] },
    { name: 'escrowAdd', args: ['channel', 'alice', 50] }
  ]);
  assert.equal(state.seats[0].stack, 50);
  assert.equal(state.seats[0].joinedAt, 1_700_000_000_000);
  assert.equal(timers[0].delay, 600_000);
  assert.equal(state.closeDeadline, 1_700_000_600_000);
});

test('holdem: insufficient buy-in balance never seats or debits the player', async t => {
  const state = table({ phase: 'LOBBY', seats: [] });
  registerTable(t, state);
  databaseFakes.set('getUserBalances', async () => ({ chips: 5 }));
  const request = interaction(state, 'alice');
  await holdem.joinTable(request, {}, 50);
  assert.equal(state.seats.length, 0);
  assert.deepEqual(databaseCalls.map(call => call.name), ['getUserBalances']);
  assert.match(request.replies[0].content, /Not enough Chips/);
});

test('holdem: manual start rotates button, posts blinds, deals, and arms action timers', async t => {
  const state = table({ phase: 'LOBBY', buttonIndex: -1, hostId: 'alice' });
  registerTable(t, state);
  const timers = captureTimers(t);
  t.mock.method(crypto, 'randomInt', limit => limit - 1);
  databaseFakes.set('createHoldemHand', async () => 123);
  databaseFakes.set('escrowCommit', async () => 0);
  await holdem.startHand(interaction(state, 'alice'), {});
  assert.deepEqual([state.buttonIndex, state.toAct, state.pot, state.handDbId], [0, 0, 15, 123]);
  assert.deepEqual(state.seats.map(player => player.stack), [100, 95, 90]);
  assert.deepEqual(state.seats.map(player => player.hole), [
    ['A♠', 'K♠'], ['Q♠', 'J♠'], ['T♠', '9♠']
  ]);
  assert.deepEqual(databaseCalls, [
    { name: 'createHoldemHand', args: ['channel', 1, '', '[]', 0] },
    { name: 'escrowCommit', args: ['channel', 'bob', 123, 'PREFLOP', 5] },
    { name: 'escrowCommit', args: ['channel', 'carol', 123, 'PREFLOP', 10] }
  ]);
  assert.deepEqual(timers.map(timer => timer.delay), [20_000, 30_000]);
  assert.equal(state.actionDeadline, 1_700_000_030_000);
  rules.clearActionTimer(state);
  assert.ok(timers.every(timer => timer.cleared));
  assert.equal(state.actionDeadline, null);
});

test('holdem: timed-out actor folds and hands the turn to the next player', async t => {
  const state = table({ phase: 'FLOP' });
  const timers = captureTimers(t);
  const client = fakeClient();
  rules.armActionTimer(client, state);
  await timers[0].callback();
  assert.ok(client.notices.some(payload => /10 seconds left/.test(payload.content)));
  await timers[1].callback();
  assert.equal(state.seats[0].folded, true);
  assert.equal(state.toAct, 1);
  assert.equal(state.actionUserId, 'bob');
  assert.deepEqual(timers.map(timer => timer.delay), [20_000, 30_000, 20_000, 30_000]);
  rules.clearActionTimer(state);
});
