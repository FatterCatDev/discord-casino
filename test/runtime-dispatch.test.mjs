import test from 'node:test';
import assert from 'node:assert/strict';
import { MessageFlags } from 'discord.js';
import { createInteractionHandler } from '../src/runtime/interactions.mjs';
import { createComponentRouter } from '../src/runtime/component-routing.mjs';
import { commandHandlers } from '../src/runtime/commands.mjs';
import { createCommandContext } from '../src/runtime/context.mjs';
import { getGuildSettingsCached, invalidateGuildSettingsCache, invalidateAccessCache } from '../src/runtime/caches.mjs';
import { hasOwnerOverride, hasAdminAccess, hasModeratorAccess } from '../src/runtime/access.mjs';
import { OWNER_USER_IDS } from '../src/runtime/config.mjs';
import { activeSessions, keyFor } from '../src/games/session.mjs';
import { databaseFakes, databaseCalls, resetDatabaseFakes } from './support/database.mjs';

function fixture(t, name, kind = 'command') {
  const calls = [];
  const guildId = `dispatch-${t.name}`;
  const interaction = {
    commandName: name, customId: name, guild: { id: guildId },
    user: { id: 'dispatch-user', send: async payload => calls.push(['dm', payload]) },
    inGuild: () => false,
    isChatInputCommand: () => kind === 'command',
    isButton: () => kind === 'button',
    isStringSelectMenu: () => kind === 'select',
    isModalSubmit: () => kind === 'modal',
    reply: async payload => { calls.push(['reply', payload]); interaction.replied = true; },
    followUp: async payload => calls.push(['followUp', payload]),
    update: async payload => calls.push(['update', payload]),
    deferUpdate: async () => calls.push(['deferUpdate']),
    showModal: async modal => calls.push(['modal', modal.toJSON()])
  };
  databaseFakes.set('getGuildSettings', async () => ({ kitten_mode_enabled: false }));
  databaseFakes.set('recordUserInteraction', async () => null);
  databaseFakes.set('getUserOnboardingStatus', async () => ({ acknowledgedAt: 1 }));
  databaseFakes.set('getAdmins', async () => []);
  databaseFakes.set('getModerators', async () => []);
  databaseFakes.set('touchUserActivityLifecycle', async () => ({ is_inactive: false }));
  t.after(() => {
    invalidateGuildSettingsCache(guildId);
    invalidateAccessCache(guildId);
    activeSessions.delete(keyFor(interaction));
    resetDatabaseFakes();
  });
  return { interaction, calls };
}

test('dispatch: onboarding gates commands before cleanup and inactivity handling', async t => {
  const { interaction, calls } = fixture(t, 'help');
  databaseFakes.set('getUserOnboardingStatus', async () => ({ chipsGranted: 200 }));
  const session = { type: 'test' };
  activeSessions.set(keyFor(interaction), session);
  t.mock.method(commandHandlers, 'help', () => assert.fail('onboarding must gate the command'));
  await createInteractionHandler(createCommandContext({}), () => assert.fail('not a component'))(interaction);
  assert.equal(activeSessions.get(keyFor(interaction)), session);
  assert.equal(databaseCalls.some(call => call.name === 'touchUserActivityLifecycle'), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].flags, MessageFlags.Ephemeral);
  assert.equal(calls[0][1].components[0].components[0].data.custom_id, 'welcome|ack');
});

test('dispatch: slash flow logs, cleans up, handles inactivity, executes, and invalidates settings', async t => {
  const { interaction } = fixture(t, 'setmaxbet');
  const order = [];
  databaseFakes.set('recordUserInteraction', async () => { order.push('log'); return null; });
  databaseFakes.set('getUserOnboardingStatus', async () => { order.push('onboard'); return { acknowledgedAt: 1 }; });
  databaseFakes.set('touchUserActivityLifecycle', async () => { order.push('activity'); return { is_inactive: false }; });
  const settings = await getGuildSettingsCached(interaction.guild.id);
  const build = createCommandContext({});
  t.mock.method(commandHandlers, 'setmaxbet', async (received, ctx) => {
    assert.equal(received, interaction);
    assert.equal(typeof ctx.awaitSessionCleanup, 'function');
    await ctx.awaitSessionCleanup();
    order.push('command');
    return 'handled';
  });
  const result = await createInteractionHandler(build, () => assert.fail('not a component'))(interaction);
  assert.equal(result, 'handled');
  assert.deepEqual(order, ['log', 'onboard', 'activity', 'command']);
  assert.notEqual(await getGuildSettingsCached(interaction.guild.id), settings);
});

test('dispatch: access mutation invalidates cached administrators and moderators', async t => {
  const { interaction } = fixture(t, 'addadmin');
  t.mock.method(commandHandlers, 'addadmin', async () => {});
  await hasAdminAccess(interaction.guild.id, 'someone');
  await hasModeratorAccess(interaction.guild.id, 'someone');
  await createInteractionHandler(createCommandContext({}), () => {})(interaction);
  databaseFakes.set('getAdmins', async () => ['someone']);
  databaseFakes.set('getModerators', async () => ['someone-else']);
  assert.equal(await hasAdminAccess(interaction.guild.id, 'someone'), true);
  assert.equal(await hasModeratorAccess(interaction.guild.id, 'someone-else'), true);
});

test('dispatch: owner override bypasses access database queries', async t => {
  t.after(resetDatabaseFakes);
  assert.equal(hasOwnerOverride(OWNER_USER_IDS[0]), true);
  assert.equal(await hasAdminAccess('owner-guild', OWNER_USER_IDS[0]), true);
  assert.equal(await hasModeratorAccess('owner-guild', OWNER_USER_IDS[0]), true);
  assert.equal(databaseCalls.length, 0);
});

test('dispatch: unknown commands reply ephemerally', async t => {
  const { interaction, calls } = fixture(t, 'not-a-command');
  await createInteractionHandler(createCommandContext({}), () => {})(interaction);
  assert.equal(calls[0][1].content, '❌ Unknown command.');
  assert.equal(calls[0][1].flags, MessageFlags.Ephemeral);
});

test('dispatch: command failures use reply/followUp while expired interactions are ignored', async t => {
  const errors = [];
  const warnings = [];
  t.mock.method(console, 'error', (...args) => errors.push(args));
  t.mock.method(console, 'warn', (...args) => warnings.push(args));
  const { interaction, calls } = fixture(t, 'help');
  let error = new Error('command failed');
  t.mock.method(commandHandlers, 'help', async () => { throw error; });
  const dispatch = createInteractionHandler(createCommandContext({}), () => {});
  await dispatch(interaction);
  assert.equal(calls[0][0], 'reply');
  await dispatch(interaction);
  assert.equal(calls[1][0], 'followUp');
  error = Object.assign(new Error('expired'), { code: 10062 });
  await dispatch(interaction);
  assert.equal(calls.length, 2);
  assert.equal(errors.length, 2);
  assert.equal(warnings.length, 1);
});

test('dispatch: component router receives persona context without running slash lifecycle', async t => {
  const { interaction, calls } = fixture(t, 'unrecognized', 'button');
  databaseFakes.set('getGuildSettings', async () => ({ kitten_mode_enabled: true }));
  const dispatch = createInteractionHandler(() => assert.fail('no context yet'), async (received, extras) => {
    assert.equal(received, interaction);
    assert.deepEqual(extras, { kittenMode: true });
    await received.reply({ content: 'Hello there', ephemeral: true });
  });
  await dispatch(interaction);
  assert.equal(calls[0][1].flags, MessageFlags.Ephemeral);
  assert.equal(databaseCalls.some(call => call.name === 'touchUserActivityLifecycle'), false);
  assert.equal(databaseCalls.some(call => call.name === 'getUserOnboardingStatus'), false);
});

test('dispatch: synchronous component errors are caught but returned handler rejections retain their original boundary', async t => {
  const { interaction, calls } = fixture(t, 'test|component', 'button');
  const errors = [];
  t.mock.method(console, 'error', (...args) => errors.push(args));
  const error = new Error('component failure');
  const syncDispatch = createInteractionHandler(() => {}, () => { throw error; });
  await syncDispatch(interaction);
  assert.equal(calls.length, 1);
  assert.equal(errors.length, 1);
  const asyncDispatch = createInteractionHandler(() => {}, () => Promise.reject(error));
  await assert.rejects(asyncDispatch(interaction), received => received === error);
  assert.equal(calls.length, 1, 'must not add an error reply for a returned promise rejection');
  assert.equal(errors.length, 1);
});

test('routes: help noop acknowledges without constructing command context; unknown IDs are ignored', async t => {
  const { interaction, calls } = fixture(t, 'help|page|noop', 'button');
  const route = createComponentRouter(() => assert.fail('no context needed'));
  await route(interaction, {});
  assert.deepEqual(calls, [['deferUpdate']]);
  interaction.customId = 'unknown|button';
  assert.equal(await route(interaction, {}), undefined);
  assert.equal(calls.length, 1);
});

test('routes: welcome acknowledgement updates original message and clears components', async t => {
  const { interaction, calls } = fixture(t, 'welcome|ack', 'button');
  databaseFakes.set('markUserOnboardingAcknowledged', async () => ({
    acknowledged: true, status: { chipsGranted: 200, acknowledgedAt: 1 }
  }));
  await createInteractionHandler(
    () => assert.fail('welcome does not need command context'),
    () => assert.fail('welcome is handled before component dispatch')
  )(interaction);
  assert.equal(calls[0][0], 'update');
  assert.deepEqual(calls[0][1].components, []);
  assert.equal(databaseCalls.find(call => call.name === 'markUserOnboardingAcknowledged').args[0], interaction.guild.id);
});

test('routes: request rejection modal denies non-moderators before invoking handler', async t => {
  const { interaction, calls } = fixture(t, 'req|rejmodal|123', 'modal');
  await createInteractionHandler(
    () => assert.fail('must check access first'),
    () => assert.fail('must check access first')
  )(interaction);
  assert.equal(calls[0][1].content, '❌ Moderators only.');
});

test('routes: market confirm retains mode, order ID, and page in modal IDs', async t => {
  const { interaction, calls } = fixture(t, 'cartel|shares|market|buy|confirm|order-42|7', 'button');
  const route = createComponentRouter(() => ({}));
  await route(interaction, {});
  interaction.customId = 'cartel|shares|market|sell|confirm|order-43|9';
  await route(interaction, {});
  assert.equal(calls[0][1].custom_id, 'cartel|shares|market|buy|modal|order-42|7');
  assert.equal(calls[1][1].custom_id, 'cartel|shares|market|sell|modal|order-43|9');
});

test('routes: contextual button, select, and modal families all reach the context boundary', async t => {
  const { interaction } = fixture(t, '', 'button');
  const groups = {
    button: [
      'cartel|refresh', 'cartel|ranks', 'cartel|guide', 'cartel|shares|view',
      'cartel|shares|view|buy', 'cartel|shares|view|buy|page|2',
      'cartel|shares|view|sell', 'cartel|shares|view|sell|page|2', 'cartel|shares|view|posts',
      'cartel|shares|order|sell', 'cartel|shares|order|buy', 'cartel|shares|order|cancel|order-1',
      'cartel|shares|market|buy|confirm|order-1|2', 'cartel|shares|market|sell|confirm|order-2|3',
      'cartel|sell|prompt', 'cartel|sell|minigame|move|up|session-1', 'cartel|collect|prompt',
      'cartel|overview', 'cartel|warehouse|view', 'cartel|warehouse|burn', 'cartel|warehouse|export',
      'cartel|dealers|view|2', 'cartel|dealers|hire|tier|2', 'cartel|dealers|upkeep|dealer-1',
      'cartel|dealers|manage|fire', 'cartel|dealers|manage|pause', 'cartel|dealers|manage|unpause',
      'cartel|dealers|pause_all', 'cartel|dealers|fire_all', 'cartel|dealers|collect',
      'cartel|dealers|pause|dealer|1', 'cartel|dealers|fire|dealer|1',
      'jobstatus|1', 'jobshift|1', 'rb|1', 'bj|1', 'slots|1', 'dice|1', 'rou|1',
      'hold|1', 'req|1', 'dailyspin|1', 'help|page|2'
    ],
    select: [
      'rou|type', 'cartel|shares|posts|select', 'cartel|shares|market|buy|select|2',
      'cartel|shares|market|sell|select|2', 'cartel|dealers|manage|select', 'help|section', 'jobshift|1'
    ],
    modal: [
      'cartel|warehouse|burn|modal|1', 'cartel|warehouse|export|modal|1',
      'cartel|dealers|upkeep_modal|1', 'cartel|collect|modal|1', 'cartel|sell|modal|1',
      'cartel|shares|order|modal|BUY|1|shares', 'cartel|shares|market|buy|modal|1|2',
      'cartel|shares|market|sell|modal|1|2', 'bj|betmodal|1', 'rou|modal|1',
      'hold|bet|1', 'hold|join|1', 'hold|custom|1'
    ]
  };
  const boundary = new Error('stop before the domain handler');
  const extras = { kittenMode: true };
  let contextCalls = 0;
  const route = createComponentRouter((received, receivedExtras) => {
    assert.equal(received, interaction);
    assert.equal(receivedExtras, extras);
    contextCalls += 1;
    throw boundary;
  });
  for (const [kind, ids] of Object.entries(groups)) {
    interaction.isButton = () => kind === 'button';
    interaction.isStringSelectMenu = () => kind === 'select';
    interaction.isModalSubmit = () => kind === 'modal';
    for (const id of ids) {
      interaction.customId = id;
      assert.throws(() => route(interaction, extras), error => error === boundary, `${kind}: ${id}`);
    }
  }
  assert.equal(contextCalls, 63);
});
