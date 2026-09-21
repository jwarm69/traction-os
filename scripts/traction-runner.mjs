#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { TractionRunner, RunnerHttp } from './runner/client.mjs';
import {
  deleteDeviceCredential,
  loadDeviceCredential,
  saveDeviceCredential,
} from './runner/keychain.mjs';

const args = new Map();
const flags = new Set([
  'pair',
  'remember',
  'resume',
  'forget',
  'allow-local-http',
  'enable-computer-use',
  'help',
]);
const values = new Set([
  'server',
  'workspace',
  'name',
  'max-runtime-ms',
  'codex-home',
  'python',
]);
for (let i = 2; i < process.argv.length; i++) {
  const name = process.argv[i].replace(/^--/, '');
  if (flags.has(name)) args.set(name, true);
  else if (
    values.has(name) &&
    process.argv[i + 1] &&
    !process.argv[i + 1].startsWith('--')
  )
    args.set(name, process.argv[++i]);
  else throw new Error(`Unknown or incomplete option: ${process.argv[i]}`);
}
const usage =
  'Usage: node scripts/traction-runner.mjs --server https://traction.example (--pair [--remember] | --resume | --forget) --workspace /absolute/task-folder [--codex-home /absolute/codex-home] [--enable-computer-use] [--python /path/to/python] [--allow-local-http]';
const stored = args.has('remember') || args.has('resume') || args.has('forget');
if (stored && process.platform !== 'darwin')
  throw new Error(
    'Persistent pairing uses the macOS login Keychain and is available on macOS only.',
  );
if (args.has('pair') && args.has('resume'))
  throw new Error('Use either --pair or --resume, not both.');
if (args.has('remember') && !args.has('pair'))
  throw new Error('--remember stores the token produced by --pair.');

if (args.has('forget')) {
  if (!args.get('server')) throw new Error(usage);
  const removed = await deleteDeviceCredential(args.get('server'));
  console.log(
    removed
      ? 'Stored device credential deleted from the Keychain.'
      : 'No stored device credential for that server.',
  );
  process.exit(0);
}
if (
  args.has('help') ||
  !args.get('server') ||
  !args.get('workspace') ||
  !(args.has('pair') || args.has('resume'))
) {
  console.log(usage);
  process.exit(args.has('help') ? 0 : 2);
}
const workspaceRoot = path.resolve(args.get('workspace'));
const codexHome = args.get('codex-home')
  ? path.resolve(args.get('codex-home'))
  : undefined;
const maxRuntimeMs = Number(args.get('max-runtime-ms') || 20 * 60_000);
if (
  !Number.isFinite(maxRuntimeMs) ||
  maxRuntimeMs < 1000 ||
  maxRuntimeMs > 30 * 60_000
)
  throw new Error('Runtime must be 1 second–30 minutes.');
const baseUrl = args.get('server'),
  allowLocalHttp = args.has('allow-local-http');
const resuming = args.has('resume');
let credential;
if (resuming) {
  credential = await loadDeviceCredential(baseUrl);
  if (!credential)
    throw new Error(
      'No stored device credential for that server. Pair again with --pair --remember.',
    );
} else {
  const http = new RunnerHttp(baseUrl, '', { allowLocalHttp });
  const prompt = createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  let code;
  try {
    code = (await prompt.question('Pairing code from Traction: ')).trim();
  } finally {
    prompt.close();
  }
  const paired = await http.post('/api/runner', {
    op: 'pair',
    code,
    deviceName: args.get('name') || os.hostname(),
    computerUse: args.has('enable-computer-use'),
  });
  if (!paired?.token || !paired?.deviceId)
    throw new Error('Pairing did not return device credentials.');
  credential = { token: paired.token, deviceId: paired.deviceId };
  if (args.has('remember'))
    await saveDeviceCredential(baseUrl, credential).catch((error) => {
      console.error(`Could not remember this device: ${error.message}`);
      process.exitCode = 1;
    });
}
const runner = new TractionRunner({
  baseUrl,
  token: credential.token,
  deviceId: credential.deviceId,
  workspaceRoot,
  codexHome,
  allowLocalHttp,
  maxRuntimeMs,
  computerUse: args.has('enable-computer-use'),
  python: args.get('python') || 'python3',
  computerBridge: new URL('./computer-use/traction_bridge.py', import.meta.url)
    .pathname,
});
console.log(
  resuming
    ? 'Resumed with the stored device credential. Keep this terminal open.'
    : args.has('remember')
      ? 'Paired. Keep this terminal open. The device credential is stored in the login Keychain; restart with --resume or delete it with --forget.'
      : 'Paired. Keep this terminal open. Device credentials remain in memory; pair again after restart.',
);
process.on('SIGINT', () => runner.stop());
process.on('SIGTERM', () => runner.stop());
try {
  await runner.run();
} catch (error) {
  if (resuming && error.status === 401) {
    await deleteDeviceCredential(baseUrl).catch(() => {});
    console.error(
      'This device was revoked. The stored credential has been deleted; pair again with --pair --remember.',
    );
  } else console.error(`Runner stopped: ${error.message}`);
  process.exitCode = 1;
}
