import test from 'node:test';
import assert from 'node:assert/strict';
import { runInactivitySweepForTest } from '../src/services/inactivity.mjs';

test('behavior: marks users inactive only after threshold', async () => {
  const candidates = [
    { user_id: 'u-old', inactive_days: 45 },
    { user_id: 'u-new', inactive_days: 12 },
  ];
  const marked = [];

  const counters = await runInactivitySweepForTest(
    { users: { fetch: async () => ({ send: async () => {} }) } },
    {
      inactiveDaysThreshold: 30,
      dmEnabled: false,
      deps: {
        listUsersToMarkInactive: async (thresholdDays) => (
          candidates.filter(row => row.inactive_days >= thresholdDays)
        ),
        markUsersInactive: async (ids) => {
          marked.push(...ids);
        },
        markUserInactiveDmResult: async () => {},
        recordUserActivityLifecycleEvent: async () => {},
      },
    }
  );

  assert.deepEqual(marked, ['u-old']);
  assert.equal(counters.scanned, 1);
  assert.equal(counters.newInactive, 1);
  assert.equal(counters.dmSent, 0);
  assert.equal(counters.dmFailed, 0);
});

test('behavior: does not mark users inactive before threshold', async () => {
  const candidates = [
    { user_id: 'u-a', inactive_days: 7 },
    { user_id: 'u-b', inactive_days: 12 },
  ];
  const marked = [];

  const counters = await runInactivitySweepForTest(
    { users: { fetch: async () => ({ send: async () => {} }) } },
    {
      inactiveDaysThreshold: 30,
      dmEnabled: false,
      deps: {
        listUsersToMarkInactive: async (thresholdDays) => (
          candidates.filter(row => row.inactive_days >= thresholdDays)
        ),
        markUsersInactive: async (ids) => {
          marked.push(...ids);
        },
        markUserInactiveDmResult: async () => {},
        recordUserActivityLifecycleEvent: async () => {},
      },
    }
  );

  assert.deepEqual(marked, []);
  assert.equal(counters.scanned, 0);
  assert.equal(counters.newInactive, 0);
  assert.equal(counters.dmSent, 0);
  assert.equal(counters.dmFailed, 0);
});

test('behavior: inactivity DM result bookkeeping records sent and failed attempts', async () => {
  const dmResults = [];
  const events = [];

  const counters = await runInactivitySweepForTest(
    {
      users: {
        fetch: async (uid) => ({
          send: async () => {
            if (uid === 'u-fail') throw new Error('dm blocked');
          },
        }),
      },
    },
    {
      inactiveDaysThreshold: 30,
      dmEnabled: true,
      nowMs: 1_700_000_000_000,
      deps: {
        listUsersToMarkInactive: async () => [{ user_id: 'u-ok' }, { user_id: 'u-fail' }],
        markUsersInactive: async () => {},
        markUserInactiveDmResult: async (uid, payload) => {
          dmResults.push({ uid, ...payload });
        },
        recordUserActivityLifecycleEvent: async (uid, eventType) => {
          events.push({ uid, eventType });
        },
      },
    }
  );

  assert.equal(counters.scanned, 2);
  assert.equal(counters.newInactive, 2);
  assert.equal(counters.dmSent, 1);
  assert.equal(counters.dmFailed, 1);

  assert.deepEqual(dmResults, [
    { uid: 'u-ok', sent: true, timestamp: 1700000000 },
    { uid: 'u-fail', sent: false, timestamp: 1700000000 },
  ]);

  assert.deepEqual(
    events.map(e => [e.uid, e.eventType]),
    [
      ['u-ok', 'MARK_INACTIVE'],
      ['u-fail', 'MARK_INACTIVE'],
      ['u-ok', 'INACTIVE_DM_SENT'],
      ['u-fail', 'INACTIVE_DM_FAIL'],
    ]
  );
});
