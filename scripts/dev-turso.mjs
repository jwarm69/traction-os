// Local development only. Keep the short-lived database token in process memory.
// Uses the isolated traction-dev database; set TRACTION_DEV_DB=traction-memory
// only when you deliberately need live data. AI keys load from .env.local.
import { spawn, spawnSync } from 'node:child_process';
const database = process.env.TRACTION_DEV_DB || 'traction-dev';
const result = spawnSync(
  'turso',
  ['db', 'tokens', 'create', database, '--expiration', '1d'],
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
  env: {
    ...process.env,
    TRACTION_LOCAL_TURSO_TOKEN: result.stdout.trim(),
    TURSO_DATABASE_URL: `libsql://${database}-jwarm16.aws-us-east-1.turso.io`,
    TURSO_AUTH_TOKEN: result.stdout.trim(),
    ALLOW_DEV_IDENTITY: 'true',
    RUNNER_ENABLED: 'true',
  },
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
