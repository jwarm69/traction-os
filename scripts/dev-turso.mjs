// Local development only. Keep the short-lived database token in process memory.
import { spawn, spawnSync } from 'node:child_process';
const result = spawnSync(
  'turso',
  ['db', 'tokens', 'create', 'traction-memory', '--expiration', '1d'],
  { encoding: 'utf8' },
);
if (result.status !== 0 || !result.stdout.trim().startsWith('ey')) {
  console.error(
    'Could not obtain the short-lived development database credential.',
  );
  process.exit(1);
}
const child = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  env: { ...process.env, TRACTION_LOCAL_TURSO_TOKEN: result.stdout.trim() },
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
