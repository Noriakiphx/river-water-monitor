import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

async function invoke(name, options = {}) {
  const actor = Object.hasOwn(options, 'actor') ? options.actor : { id: 'u1', role: 'user' };
  const effects = [];
  const rule = { id: 'r1', userId: options.ruleOwner ?? 'u1', stationId: options.ruleStation ?? 'st1', thresholdType: 'warning' };
  const repos = {
    rules: { getById: () => Promise.resolve(rule) }, stations: { getById: () => Promise.resolve({ id: 'st1' }) },
    levels: { latestByStation: () => Promise.resolve(new Map(options.noReading ? [] : [['st1', { waterLevel: 3.2, observedAt: '2026-10-22T00:00:00Z' }]])) },
  };
  let handler;
  const source = stripTypeScriptTypes(await readFile(new URL('../src/functions/' + name + '.ts', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from\s+"[^"\n]+";\s*/gm, '');
  const names = ['createClientFromRequest', 'makeBase44Repositories', 'linkLineUser', 'sendLineNotification', 'resolveThreshold', 'consoleLogger', 'systemClock', 'LineMessagingClient', 'evaluateWatchRules', 'fetchWaterLevels', 'MockWaterLevelProvider', 'Deno'];
  new Function(...names, source)(
    () => ({ auth: { me: () => Promise.resolve(actor) } }), () => repos,
    (id, line) => { effects.push({ id, line }); return Promise.resolve({ id }); },
    target => { effects.push(target); return Promise.resolve({ status: 'success' }); },
    () => 3, {}, { now: () => new Date('2026-10-22T00:01:00Z') }, { fromEnv: () => ({}) },
    () => Promise.resolve([]), () => Promise.resolve({}), class {}, { serve: fn => { handler = fn; } },
  );
  const payload = { userId: 'u1', lineUserId: 'U' + 'a'.repeat(32), stationId: 'st1', watchRuleId: 'r1', waterLevel: 9999, ...options.payload };
  const response = await handler(new Request('https://app.example.invalid', { method: 'POST', body: JSON.stringify(payload) }));
  return { response, effects };
}

test('LINE account linking requires the authenticated user to own the target account', async () => {
  for (const [options, status] of [[{ actor: null }, 401], [{ payload: { userId: 'victim' } }, 403], [{ payload: { lineUserId: '../invalid' } }, 400]]) {
    const result = await invoke('linkLineUser', options);
    assert.equal(result.response.status, status); assert.deepEqual(result.effects, []);
  }
  const result = await invoke('linkLineUser');
  assert.equal(result.response.status, 200); assert.equal(result.effects[0].id, 'u1');
});

test('manual notifications reject unrelated users, rules and stations before sending', async () => {
  for (const [options, status] of [[{ actor: null }, 401], [{ payload: { userId: 'victim' } }, 403], [{ ruleOwner: 'victim' }, 404], [{ ruleStation: 'st2' }, 404], [{ noReading: true }, 409]]) {
    const result = await invoke('sendLineNotification', options);
    assert.equal(result.response.status, status); assert.deepEqual(result.effects, []);
  }
  const result = await invoke('sendLineNotification');
  assert.equal(result.response.status, 200);
  assert.equal(result.effects[0].waterLevel, 3.2);
  assert.equal(result.effects[0].observedAt, '2026-10-22T00:00:00Z');
});

test('scheduled entry points cannot bypass manual notification authorization', async () => {
  for (const name of ['evaluateWatchRules', 'fetchWaterLevels']) {
    assert.equal((await invoke(name, { actor: null })).response.status, 401);
    assert.equal((await invoke(name)).response.status, 403);
    assert.equal((await invoke(name, { actor: { id: 'admin', role: 'admin' } })).response.status, 200);
  }
});
