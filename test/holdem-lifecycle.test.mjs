import test from 'node:test';
import assert from 'node:assert/strict';
import * as holdem from '../src/games/holdem.mjs';
import { showdown } from '../src/games/holdem/pots.mjs';
import { doFold, afterActionMaybeAdvance } from '../src/games/holdem/betting.mjs';
import {
  armActionTimer, startHandAuto, scheduleNextHand
} from '../src/games/holdem/hand-lifecycle.mjs';
import { closeTable, scheduleEmptyClose, scheduleLobbyClose } from '../src/games/holdem/table-maintenance.mjs';
import { kickHostForInactivity, scheduleHostKick } from '../src/games/holdem/table-lifecycle.mjs';
import { persistHandResult } from '../src/games/holdem/persistence.mjs';
import { buildTablePayload } from '../src/games/holdem/presentation.mjs';
import { databaseCalls, databaseFakes, resetDatabaseFakes } from './support/database.mjs';
import { seat, table, registerTable, fakeClient, interaction, captureTimers } from './support/holdem-fixtures.mjs';

test('holdem: hosting reserves a table number without listing guild channels', async t => {
  captureTimers(t);
  const request = interaction(table(), 'alice');
  const created = [];
  request.guild.roles = { everyone: { id: 'everyone' } };
  request.client.user = { id: 'bot' };
  request.guild.channels = {
    create: async options => {
      created.push(options);
      return {
        id: 'new-channel',
        send: async () => ({ id: 'table-message', channelId: 'new-channel' })
      };
    },
    fetch: () => assert.fail('Hosting must not scan guild channels')
  };
  databaseFakes.set('getGuildSettings', async () => ({
    casino_category_id: 'casino-category', holdem_rake_bps: 250
  }));
  databaseFakes.set('reserveHoldemTableNumber', async () => 42);
  t.after(() => { holdem.holdemTables.clear(); resetDatabaseFakes(); });
  const state = await holdem.hostTable(request, {
    listAdmins: async () => ['staff'],
    listModerators: async () => ['staff', 'mod']
  }, { sb: 5, bb: 10, min: 20, max: 500, cap: 6, rakeBps: 500 });
  assert.equal(created[0].name, 'holdem-table-42');
  assert.equal(created[0].parent, 'casino-category');
  assert.deepEqual(created[0].permissionOverwrites.map(item => item.id),
    ['everyone', 'bot', 'alice', 'staff', 'mod']);
  assert.equal(holdem.ensureTableInChannel('guild', 'new-channel'), state);
  assert.deepEqual([state.rakeBps, state.rakeCap, state.cap, state.msgId],
    [250, 500, 6, 'table-message']);
  assert.deepEqual(databaseCalls.map(call => call.name),
    ['getGuildSettings', 'reserveHoldemTableNumber']);
});

test('holdem: rebuys only debit between hands and honor the maximum stack', async t => {
  const state = table({ phase: 'LOBBY' });
  registerTable(t, state);
  databaseFakes.set('getUserBalances', async () => ({ chips: 1_000 }));
  databaseFakes.set('escrowAdd', async () => 0);
  await holdem.rebuyAtTable(interaction(state, 'alice'), {}, 50);
  assert.deepEqual([state.seats[0].stack, state.seats[0].buyInTotal], [150, 50]);
  assert.deepEqual(databaseCalls.map(call => call.name), ['getUserBalances', 'escrowAdd']);
  databaseCalls.length = 0;
  state.phase = 'FLOP';
  const active = interaction(state, 'alice');
  await holdem.rebuyAtTable(active, {}, 50);
  assert.match(active.replies[0].content, /between hands/);
  state.phase = 'LOBBY';
  const overLimit = interaction(state, 'alice');
  await holdem.rebuyAtTable(overLimit, {}, 400);
  assert.match(overLimit.replies[0].content, /exceed table max/);
  assert.deepEqual(databaseCalls, []);
});

test('holdem: leaving during a hand refunds escrow and returns a lone player to the lobby', async t => {
  const state = table({ hostId: 'alice', seats: [seat('alice'), seat('bob')], pot: 15 });
  registerTable(t, state);
  captureTimers(t);
  databaseFakes.set('getEscrowBalance', async () => 80);
  databaseFakes.set('escrowReturn', async () => 0);
  databaseFakes.set('getUserBalances', async () => ({ chips: 200 }));
  databaseFakes.set('getHouseBalance', async () => 5_000);
  databaseFakes.set('getGuildSettings', async () => ({}));
  const request = interaction(state, 'alice');
  await holdem.leaveTable(request, {});
  assert.deepEqual(state.seats.map(player => player.userId), ['bob']);
  assert.deepEqual([state.hostId, state.phase, state.pot, state.toAct], ['bob', 'LOBBY', 0, null]);
  assert.match(request.replies[0].content, /Refunded/);
  assert.deepEqual(databaseCalls.slice(0, 2), [
    { name: 'getEscrowBalance', args: ['channel', 'alice'] },
    { name: 'escrowReturn', args: ['channel', 'alice', 80] }
  ]);
});

test('holdem: sit-out/sit-in toggles retain wait-for-BB state', async t => {
  const state = table();
  registerTable(t, state);
  await holdem.onHoldemButton(interaction(state, 'alice', 'hold|sitout'), {});
  assert.deepEqual([state.seats[0].sitOut, state.seats[0].waitForBB, state.seats[0].missedBlinds],
    [true, true, 0]);
  state.seats[0].missedBlinds = 1;
  await holdem.onHoldemButton(interaction(state, 'alice', 'hold|sitin'), {});
  assert.deepEqual([state.seats[0].sitOut, state.seats[0].waitForBB, state.seats[0].missedBlinds],
    [false, true, 0]);
});

test('holdem: manual start skips waiting seats until their big blind', async t => {
  const state = table({ phase: 'LOBBY', hostId: 'alice', buttonIndex: -1 });
  registerTable(t, state);
  captureTimers(t);
  state.seats[1].waitForBB = true;
  state.seats[2].waitForBB = true;
  databaseFakes.set('createHoldemHand', async () => 123);
  databaseFakes.set('escrowCommit', async () => 0);
  await holdem.startHand(interaction(state, 'alice'), {});
  assert.equal(state.seats[1].inHand, false);
  assert.equal(state.seats[1].hole.length, 0);
  assert.equal(state.seats[2].inHand, true);
  assert.equal(state.seats[2].waitForBB, false);
  assert.equal(state.seats[2].hole.length, 2);
  assert.equal(state.pot, 10);
});

test('holdem: automatic start skips previously folded seats when rotating the button', async t => {
  const state = table({ phase: 'COMPLETE', buttonIndex: 0 });
  registerTable(t, state);
  captureTimers(t);
  state.seats[1].folded = true;
  databaseFakes.set('createHoldemHand', async () => 123);
  databaseFakes.set('escrowCommit', async () => 0);
  await startHandAuto(fakeClient(), state);
  assert.deepEqual([state.buttonIndex, state.toAct, state.pot], [2, 2, 15]);
  assert.deepEqual(state.seats.map(player => player.stack), [95, 90, 100]);
  assert.ok(state.seats.every(player => player.hole.length === 2 && !player.folded));
});

test('holdem: automatic start removes seats that cannot cover the big blind', async t => {
  const state = table({ phase: 'COMPLETE' });
  registerTable(t, state);
  captureTimers(t);
  state.seats[0].stack = 9;
  databaseFakes.set('createHoldemHand', async () => 123);
  databaseFakes.set('escrowCommit', async () => 0);
  const notifications = [];
  const client = fakeClient();
  client.users = { fetch: async id => ({ send: async text => notifications.push({ id, text }) }) };
  await startHandAuto(client, state);
  assert.deepEqual(state.seats.map(player => player.userId), ['bob', 'carol']);
  assert.equal(notifications[0].id, 'alice');
  assert.match(notifications[0].text, /insufficient chips/);
});

test('holdem: idle seated host is refunded and replaced', async t => {
  const state = table({ phase: 'LOBBY', hostId: 'alice', toAct: null });
  registerTable(t, state);
  captureTimers(t);
  databaseFakes.set('getEscrowBalance', async () => 100);
  databaseFakes.set('escrowReturn', async () => 0);
  await kickHostForInactivity(fakeClient(), state);
  assert.equal(state.hostId, 'bob');
  assert.deepEqual(state.seats.map(player => player.userId), ['bob', 'carol']);
  assert.deepEqual(databaseCalls.map(call => call.name), ['getEscrowBalance', 'escrowReturn']);
  assert.equal(state.hostKickTimer.delay, 600_000);
});

test('holdem: closing removes the temporary channel, source message, and registry entry', async t => {
  const state = table({
    tempChannel: true, originMsgChannelId: 'origin', originMsgId: 'source',
    actionTimer: {}, warningTimer: {}, nextHandTimer: {}, closeTimer: {}
  });
  registerTable(t, state);
  captureTimers(t);
  const removed = [];
  const client = {
    channels: {
      fetch: async id => ({
        deletable: true, isTextBased: () => true,
        delete: async () => { removed.push(id); },
        messages: { fetch: async messageId => ({ delete: async () => { removed.push(messageId); } }) }
      })
    }
  };
  const owned = [state.actionTimer, state.warningTimer, state.nextHandTimer, state.closeTimer];
  await closeTable(client, state);
  assert.deepEqual(removed, ['channel', 'source']);
  assert.equal(holdem.ensureTableInChannel('guild', 'channel'), null);
  assert.ok(owned.every(timer => timer.cleared));
});

test('holdem: lobby timeout only closes a table that is still waiting', async t => {
  const state = table({ phase: 'LOBBY', msgId: 'card' });
  registerTable(t, state);
  const timers = captureTimers(t);
  scheduleLobbyClose(fakeClient(), state);
  assert.equal(timers[0].delay, 600_000);
  state.phase = 'PREFLOP';
  await timers[0].callback();
  assert.equal(holdem.ensureTableInChannel('guild', 'channel'), state);
});

test('holdem: one resolved hand credits winners, settles rake, then finalizes once', async t => {
  const state = table({ phase: 'COMPLETE', handDbId: 123, board: ['2♣', '3♦', '4♥'] });
  registerTable(t, state);
  const timers = captureTimers(t);
  databaseFakes.set('getGuildSettings', async () => ({}));
  databaseFakes.set('escrowCreditMany', async () => true);
  databaseFakes.set('settleRake', async () => 0);
  databaseFakes.set('finalizeHoldemHand', async () => {});
  await scheduleNextHand(fakeClient(), state, {
    payouts: [{ idx: 0, amount: 95 }], rake: 5
  });
  const settlement = databaseCalls.filter(call => call.name !== 'getGuildSettings');
  assert.deepEqual(settlement, [
    { name: 'escrowCreditMany', args: ['channel', [{ userId: 'alice', amount: 95 }]] },
    { name: 'settleRake', args: ['channel', 5] },
    { name: 'finalizeHoldemHand', args: [123, {
      board: '2♣,3♦,4♥', winnersJson: '[{"userId":"alice","amount":95}]', rakePaid: 5
    }] }
  ]);
  assert.equal(timers[0].delay, 10_000);
});

test('holdem: close cancels every owned timer and late callbacks cannot act', async t => {
  const state = table({ msgId: 'card', handDbId: 123 });
  registerTable(t, state);
  const timers = captureTimers(t);
  const client = fakeClient();
  databaseFakes.set('escrowCreditMany', async () => true);
  databaseFakes.set('finalizeHoldemHand', async () => {});
  armActionTimer(client, state);
  scheduleHostKick(client, state);
  await scheduleNextHand(client, state, { payouts: [], label: 'Result' });
  state.phase = 'LOBBY';
  scheduleLobbyClose(client, state);
  await closeTable(client, state);
  assert.ok(timers.every(timer => timer.cleared));
  assert.equal(state.closed, true);
  assert.equal(state.hostKickTimer, null);
  const afterClose = structuredClone(state);
  const writes = databaseCalls.length;
  for (const timer of timers) await timer.callback();
  await startHandAuto(client, state);
  armActionTimer(client, state);
  await scheduleNextHand(client, state, { payouts: [{ idx: 0, amount: 10 }] });
  assert.deepEqual(state, afterClose);
  assert.equal(databaseCalls.length, writes);
  assert.equal(timers.length, 5);
});

test('holdem: superseded action and lobby timers cannot fold or close a table', async t => {
  const state = table();
  registerTable(t, state);
  const timers = captureTimers(t);
  const client = fakeClient();
  armActionTimer(client, state);
  const staleWarning = timers[0];
  const staleAction = timers[1];
  armActionTimer(client, state);
  await staleWarning.callback();
  await staleAction.callback();
  assert.equal(state.seats[0].folded, false);
  state.phase = 'LOBBY';
  scheduleLobbyClose(client, state);
  const staleClose = timers[4];
  scheduleLobbyClose(client, state);
  await staleClose.callback();
  assert.equal(state.closed, undefined);
  assert.equal(state.closeTimer, timers[5]);
});

test('holdem: empty-table timer closes once even if its callback is delivered twice', async t => {
  const state = table({ phase: 'LOBBY', seats: [] });
  registerTable(t, state);
  const timers = captureTimers(t);
  const client = fakeClient();
  scheduleEmptyClose(client, state);
  assert.equal(timers[0].delay, 120_000);
  await timers[0].callback();
  await timers[0].callback();
  assert.equal(state.closed, true);
  assert.equal(holdem.ensureTableInChannel('guild', 'channel'), null);
});

test('holdem: closure while hand creation is pending prevents dealing and blind writes', async t => {
  const state = table({ phase: 'COMPLETE' });
  registerTable(t, state);
  captureTimers(t);
  let release;
  databaseFakes.set('createHoldemHand', () => new Promise(resolve => { release = resolve; }));
  const client = fakeClient();
  const starting = startHandAuto(client, state);
  await closeTable(client, state);
  release(123);
  await starting;
  assert.equal(state.closed, true);
  assert.ok(state.seats.every(player => player.hole.length === 0));
  assert.deepEqual(databaseCalls.map(call => call.name), ['createHoldemHand']);
});

test('holdem: persistence errors are logged and stop remaining settlement writes', async t => {
  t.after(resetDatabaseFakes);
  const logs = t.mock.method(console, 'error', () => {});
  databaseFakes.set('escrowCreditMany', async () => { throw new Error('database unavailable'); });
  await persistHandResult(table(), { payouts: [{ idx: 0, amount: 25 }] });
  assert.equal(logs.mock.calls.length, 1);
  assert.equal(logs.mock.calls[0].arguments[0], 'holdem hand settlement error:');
  assert.equal(logs.mock.calls[0].arguments[1].message, 'database unavailable');
  assert.deepEqual(databaseCalls.map(call => call.name), ['escrowCreditMany']);
});

test('holdem: table payload keeps assets, action IDs, and hidden hole cards', () => {
  const state = table({
    handNo: 1, seats: [seat('alice', { hole: ['A♠', 'K♦'] }), seat('bob')]
  });
  const payload = buildTablePayload(state);
  assert.equal(payload.files[0].name, 'holdem.png');
  const embed = payload.embeds[0].toJSON();
  assert.equal(embed.thumbnail.url, 'attachment://holdem.png');
  assert.doesNotMatch(JSON.stringify(embed), /A♠|K♦/);
  assert.deepEqual(payload.components[1].toJSON().components.map(button => button.custom_id), [
    'hold|act|fold|alice', 'hold|act|check|alice', 'hold|act|raise|alice', 'hold|act|allin|alice'
  ]);
});

test('holdem: three live players receive only the pots they contributed to', () => {
  const state = table({
    phase: 'RIVER', pot: 170,
    board: ['2♣', '5♦', '8♥', '9♠', 'J♣'],
    seats: [
      seat('alice', { stack: 0, committed: 20, hole: ['A♠', 'A♦'] }),
      seat('bob', { stack: 0, committed: 50, hole: ['K♠', 'K♦'] }),
      seat('carol', { stack: 0, committed: 100, hole: ['Q♠', 'Q♦'] })
    ]
  });
  const result = showdown(state);
  assert.deepEqual(result.payouts, [
    { idx: 0, amount: 60 }, { idx: 1, amount: 60 }, { idx: 2, amount: 50 }
  ]);
  assert.equal(state.seats.reduce((sum, player) => sum + player.stack, 0), 170);
});

test('holdem: join modal retains requester checks, escrow writes, and private acknowledgement', async t => {
  const state = table({ phase: 'LOBBY', seats: [] });
  registerTable(t, state);
  const request = interaction(state, 'alice', 'hold|join|alice');
  request.fields = { getTextInputValue: () => '50' };
  databaseFakes.set('getUserBalances', async () => ({ chips: 100 }));
  databaseFakes.set('escrowAdd', async () => 0);
  await holdem.onHoldemJoinModal(request, {});
  assert.equal(state.seats[0].userId, 'alice');
  assert.equal(state.seats[0].stack, 50);
  assert.equal(request.replies[0].ephemeral, true);
  assert.deepEqual(databaseCalls.map(call => call.name), ['getUserBalances', 'escrowAdd']);
  const wrongOwner = interaction(state, 'bob', 'hold|join|alice');
  await holdem.onHoldemJoinModal(wrongOwner, {});
  assert.match(wrongOwner.replies[0].content, /not for you/);
  assert.equal(state.seats.length, 1);
});

test('holdem: bet modal rejects invalid amounts and applies a valid raise once', async t => {
  const state = table({ currentBet: 10 });
  registerTable(t, state);
  captureTimers(t);
  const invalid = interaction(state, 'alice', 'hold|bet|alice');
  invalid.fields = { getTextInputValue: () => '-1' };
  await holdem.onHoldemBetModal(invalid, {});
  assert.match(invalid.replies[0].content, /positive integer/);
  assert.equal(state.pot, 0);
  const valid = interaction(state, 'alice', 'hold|bet|alice');
  valid.fields = { getTextInputValue: () => '25' };
  await holdem.onHoldemBetModal(valid, {});
  assert.equal(state.pot, 25);
  assert.equal(state.seats[0].stack, 75);
  assert.equal(state.toAct, 1);
  assert.equal(valid.replies[0].ephemeral, true);
  assert.deepEqual(databaseCalls, []);
});

test('holdem: table message updates retain persona callbacks after extraction', async t => {
  const state = table({ msgId: 'card' });
  registerTable(t, state);
  const request = interaction(state, 'alice', 'hold|sitout');
  const payloads = [];
  const kittenizePayload = payload => {
    payloads.push(payload);
    return { ...payload, content: 'persona marker' };
  };
  await holdem.onHoldemButton(request, { kittenModeEnabled: true, kittenizePayload });
  assert.equal(state.kittenMode, true);
  assert.equal(state.kittenizePayload, kittenizePayload);
  assert.equal(payloads.length, 1);
  assert.equal(request.client.notices[0].content, 'persona marker');
});

test('holdem: buy-in, blinds, fold settlement, and leave conserve the fake ledger', async t => {
  const state = table({ phase: 'LOBBY', hostId: 'alice', seats: [] });
  registerTable(t, state);
  captureTimers(t);
  const wallets = new Map([['alice', 100], ['bob', 100]]);
  const escrow = new Map([['alice', 0], ['bob', 0]]);
  let pot = 0;
  databaseFakes.set('getUserBalances', async (_, userId) => ({ chips: wallets.get(userId) }));
  databaseFakes.set('getEscrowBalance', async (_, userId) => escrow.get(userId));
  databaseFakes.set('escrowAdd', async (_, userId, amount) => {
    wallets.set(userId, wallets.get(userId) - amount);
    escrow.set(userId, escrow.get(userId) + amount);
  });
  databaseFakes.set('escrowCommit', async (_, userId, handId, street, amount) => {
    assert.equal(handId, 123);
    assert.equal(street, 'PREFLOP');
    escrow.set(userId, escrow.get(userId) - amount);
    pot += amount;
  });
  databaseFakes.set('escrowCreditMany', async (_, payouts) => {
    for (const { userId, amount } of payouts) {
      escrow.set(userId, escrow.get(userId) + amount);
      pot -= amount;
    }
  });
  databaseFakes.set('escrowReturn', async (_, userId, amount) => {
    wallets.set(userId, wallets.get(userId) + amount);
    escrow.set(userId, escrow.get(userId) - amount);
  });
  databaseFakes.set('createHoldemHand', async () => 123);
  databaseFakes.set('finalizeHoldemHand', async () => {});
  databaseFakes.set('getHouseBalance', async () => 0);
  databaseFakes.set('getGuildSettings', async () => ({}));
  const assertConserved = () => {
    const walletTotal = [...wallets.values()].reduce((sum, value) => sum + value, 0);
    const escrowTotal = [...escrow.values()].reduce((sum, value) => sum + value, 0);
    assert.equal(walletTotal + escrowTotal + pot, 200);
    assert.ok([...wallets.values(), ...escrow.values(), pot].every(value => value >= 0));
  };
  await holdem.joinTable(interaction(state, 'alice'), {}, 50);
  await holdem.joinTable(interaction(state, 'bob'), {}, 50);
  assertConserved();
  await holdem.startHand(interaction(state, 'alice'), {});
  assert.equal(pot, state.pot);
  assertConserved();
  await doFold(state);
  const result = afterActionMaybeAdvance(state);
  await persistHandResult(state, result);
  assert.equal(pot, 0);
  for (const player of state.seats) assert.equal(escrow.get(player.userId), player.stack);
  assertConserved();
  await holdem.leaveTable(interaction(state, 'alice'), {});
  await holdem.leaveTable(interaction(state, 'bob'), {});
  assert.deepEqual([...escrow.values()], [0, 0]);
  assertConserved();
});
