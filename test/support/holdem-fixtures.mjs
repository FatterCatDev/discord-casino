import * as holdem from '../../src/games/holdem.mjs';
import { resetDatabaseFakes } from './database.mjs';

export function seat(userId, overrides = {}) {
  return { ...holdem.emptySeat(userId, 100), inHand: true, actedRound: false, ...overrides };
}

export function table(overrides = {}) {
  return {
    guildId: 'guild', channelId: 'channel', hostId: 'host',
    phase: 'PREFLOP', sb: 5, bb: 10, min: 20, max: 500, cap: 9,
    buttonIndex: 0, toAct: 0, currentBet: 0, minRaise: 10, pot: 0,
    board: [], burned: [], deck: ['2♣', '3♦', '4♥', '5♠', '6♣', '7♦', '8♥', '9♠'],
    seats: [seat('alice'), seat('bob'), seat('carol')],
    ...overrides
  };
}

export function registerTable(t, state) {
  const key = holdem.tableKey(state.guildId, state.channelId);
  holdem.holdemTables.set(key, state);
  t.after(() => {
    holdem.holdemTables.clear();
    resetDatabaseFakes();
  });
}

export function fakeClient() {
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

export function interaction(state, userId, customId = '') {
  const replies = [];
  return {
    guild: { id: state.guildId }, channelId: state.channelId,
    user: { id: userId }, customId, client: fakeClient(), replies,
    isButton: () => false,
    reply: async payload => { replies.push(payload); return payload; },
    update: async payload => { replies.push(payload); return payload; }
  };
}

export function captureTimers(t) {
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
