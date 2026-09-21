import { spawn as nodeSpawn } from 'node:child_process';

export const KEYCHAIN_SERVICE = 'traction-runner-device';
const SECURITY = '/usr/bin/security';
const NOT_FOUND = 44;

function run(spawnImpl, args) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(SECURITY, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      reject(error);
      return;
    }
    let stdout = '',
      stderr = '';
    child.stdout?.setEncoding?.('utf8');
    child.stderr?.setEncoding?.('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > 64_000) child.kill?.();
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString().slice(0, 4000);
    });
    child.on('error', reject);
    child.on('close', (code) =>
      resolve({ code: code ?? 1, stdout, stderr: stderr.trim() }),
    );
  });
}

/** Account name for a stored credential: the validated server origin. */
export function keychainAccount(baseUrl) {
  const url = new URL(baseUrl);
  if (url.username || url.password)
    throw new Error('Use a server origin without credentials.');
  return url.origin;
}

function encode(credential) {
  if (
    !credential?.token ||
    typeof credential.token !== 'string' ||
    !credential?.deviceId ||
    typeof credential.deviceId !== 'string'
  )
    throw new Error('Device credential is incomplete.');
  return JSON.stringify({
    token: credential.token,
    deviceId: credential.deviceId,
  });
}

function decode(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/\n$/, ''));
  } catch {
    throw new Error('Stored device credential is unreadable; run --forget.');
  }
  if (
    typeof parsed?.token !== 'string' ||
    !parsed.token ||
    typeof parsed?.deviceId !== 'string' ||
    !parsed.deviceId
  )
    throw new Error('Stored device credential is incomplete; run --forget.');
  return { token: parsed.token, deviceId: parsed.deviceId };
}

/**
 * Store the device credential in the login Keychain, replacing any prior item
 * for this origin. The secret is never written to disk or printed.
 */
export async function saveDeviceCredential(
  baseUrl,
  credential,
  { spawnImpl = nodeSpawn } = {},
) {
  const account = keychainAccount(baseUrl);
  const payload = encode(credential);
  const result = await run(spawnImpl, [
    'add-generic-password',
    '-U',
    '-s',
    KEYCHAIN_SERVICE,
    '-a',
    account,
    '-D',
    'Traction runner device token',
    '-w',
    payload,
  ]);
  if (result.code !== 0)
    throw new Error(
      `Could not store the device token in the Keychain${
        result.stderr ? `: ${result.stderr}` : '.'
      }`,
    );
  return account;
}

/** Read the stored credential, or null when no item exists for this origin. */
export async function loadDeviceCredential(
  baseUrl,
  { spawnImpl = nodeSpawn } = {},
) {
  const account = keychainAccount(baseUrl);
  const result = await run(spawnImpl, [
    'find-generic-password',
    '-s',
    KEYCHAIN_SERVICE,
    '-a',
    account,
    '-w',
  ]);
  if (result.code === NOT_FOUND) return null;
  if (result.code !== 0)
    throw new Error(
      `Could not read the device token from the Keychain${
        result.stderr ? `: ${result.stderr}` : '.'
      }`,
    );
  return decode(result.stdout);
}

/** Delete the stored item. Returns false when there was nothing to delete. */
export async function deleteDeviceCredential(
  baseUrl,
  { spawnImpl = nodeSpawn } = {},
) {
  const account = keychainAccount(baseUrl);
  const result = await run(spawnImpl, [
    'delete-generic-password',
    '-s',
    KEYCHAIN_SERVICE,
    '-a',
    account,
  ]);
  if (result.code === NOT_FOUND) return false;
  if (result.code !== 0)
    throw new Error(
      `Could not delete the device token from the Keychain${
        result.stderr ? `: ${result.stderr}` : '.'
      }`,
    );
  return true;
}
