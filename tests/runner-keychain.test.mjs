import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import {
  KEYCHAIN_SERVICE,
  deleteDeviceCredential,
  keychainAccount,
  loadDeviceCredential,
  saveDeviceCredential,
} from '../scripts/runner/keychain.mjs';

// Records every invocation and replays a canned exit code / stdout. The real
// Keychain is never touched by these tests.
function fakeSpawn({ code = 0, stdout = '', stderr = '' } = {}) {
  const calls = [];
  const spawnImpl = (command, args) => {
    calls.push({ command, args });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.stderr = new EventEmitter();
    child.stderr.setEncoding = () => {};
    setImmediate(() => {
      if (stdout) child.stdout.emit('data', stdout);
      if (stderr) child.stderr.emit('data', stderr);
      child.emit('close', code);
    });
    return child;
  };
  return { spawnImpl, calls };
}

const ORIGIN = 'https://traction.example';

test('keychainAccount uses the server origin', () => {
  assert.equal(keychainAccount('https://traction.example/'), ORIGIN);
  assert.throws(
    () => keychainAccount('https://user:pass@traction.example'),
    /without credentials/,
  );
});

test('saving passes the secret to security and replaces any prior item', async () => {
  const { spawnImpl, calls } = fakeSpawn();
  const account = await saveDeviceCredential(
    ORIGIN,
    { token: 'tok', deviceId: 'dev_1' },
    { spawnImpl },
  );
  assert.equal(account, ORIGIN);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, '/usr/bin/security');
  const args = calls[0].args;
  assert.equal(args[0], 'add-generic-password');
  assert.ok(args.includes('-U'));
  assert.equal(args[args.indexOf('-s') + 1], KEYCHAIN_SERVICE);
  assert.equal(args[args.indexOf('-a') + 1], ORIGIN);
  assert.deepEqual(JSON.parse(args[args.indexOf('-w') + 1]), {
    token: 'tok',
    deviceId: 'dev_1',
  });
});

test('saving rejects incomplete credentials and reports failures', async () => {
  const { spawnImpl } = fakeSpawn();
  await assert.rejects(
    () => saveDeviceCredential(ORIGIN, { token: 'tok' }, { spawnImpl }),
    /incomplete/,
  );
  const failing = fakeSpawn({ code: 1, stderr: 'keychain locked' });
  await assert.rejects(
    () =>
      saveDeviceCredential(
        ORIGIN,
        { token: 'tok', deviceId: 'dev_1' },
        { spawnImpl: failing.spawnImpl },
      ),
    /keychain locked/,
  );
});

test('loading returns the stored credential', async () => {
  const { spawnImpl, calls } = fakeSpawn({
    stdout: `${JSON.stringify({ token: 'tok', deviceId: 'dev_1' })}\n`,
  });
  assert.deepEqual(await loadDeviceCredential(ORIGIN, { spawnImpl }), {
    token: 'tok',
    deviceId: 'dev_1',
  });
  assert.equal(calls[0].args[0], 'find-generic-password');
  assert.ok(calls[0].args.includes('-w'));
});

test('loading returns null when no item exists', async () => {
  const { spawnImpl } = fakeSpawn({ code: 44 });
  assert.equal(await loadDeviceCredential(ORIGIN, { spawnImpl }), null);
});

test('loading rejects an unreadable or partial item', async () => {
  const bad = fakeSpawn({ stdout: 'not-json\n' });
  await assert.rejects(
    () => loadDeviceCredential(ORIGIN, { spawnImpl: bad.spawnImpl }),
    /unreadable/,
  );
  const partial = fakeSpawn({ stdout: JSON.stringify({ token: 'tok' }) });
  await assert.rejects(
    () => loadDeviceCredential(ORIGIN, { spawnImpl: partial.spawnImpl }),
    /incomplete/,
  );
});

test('deleting reports whether an item was removed', async () => {
  const present = fakeSpawn();
  assert.equal(
    await deleteDeviceCredential(ORIGIN, { spawnImpl: present.spawnImpl }),
    true,
  );
  assert.equal(present.calls[0].args[0], 'delete-generic-password');
  const absent = fakeSpawn({ code: 44 });
  assert.equal(
    await deleteDeviceCredential(ORIGIN, { spawnImpl: absent.spawnImpl }),
    false,
  );
  const failing = fakeSpawn({ code: 51, stderr: 'not authorized' });
  await assert.rejects(
    () => deleteDeviceCredential(ORIGIN, { spawnImpl: failing.spawnImpl }),
    /not authorized/,
  );
});
