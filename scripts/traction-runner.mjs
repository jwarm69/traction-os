#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { TractionRunner, RunnerHttp } from './runner/client.mjs';

const args = new Map();
const flags = new Set(['pair', 'allow-local-http', 'help']);
const values = new Set([
  'server',
  'workspace',
  'name',
  'max-runtime-ms',
  'codex-home',
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
if (
  args.has('help') ||
  !args.get('server') ||
  !args.get('workspace') ||
  !args.has('pair')
) {
  console.log(
    'Usage: node scripts/traction-runner.mjs --server https://traction.example --pair --workspace /absolute/task-folder [--codex-home /absolute/codex-home] [--allow-local-http]',
  );
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
});
if (!paired?.token || !paired?.deviceId)
  throw new Error('Pairing did not return device credentials.');
const runner = new TractionRunner({
  baseUrl,
  token: paired.token,
  deviceId: paired.deviceId,
  workspaceRoot,
  codexHome,
  allowLocalHttp,
  maxRuntimeMs,
});
console.log(
  'Paired. Keep this terminal open. Device credentials remain in memory; pair again after restart.',
);
process.on('SIGINT', () => runner.stop());
process.on('SIGTERM', () => runner.stop());
try {
  await runner.run();
} catch (error) {
  console.error(`Runner stopped: ${error.message}`);
  process.exitCode = 1;
}
