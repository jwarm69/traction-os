/**
 * Owner plan grant for one computer-use job. On the named domains the paired
 * runner may perform routine steps without a per-action prompt; consequential
 * steps still pause. The runner re-validates and enforces this locally.
 */
export type RunnerGrant = { domains: string[]; steps: number };

export const MAX_GRANT_STEPS = 40;
const MIN_GRANT_STEPS = 8;
const domainPattern =
  /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

/** Accept "example.com" or a pasted https URL; anything else is rejected. */
export function grantDomain(value: string) {
  let host = value.trim().toLowerCase();
  if (host.startsWith('https://')) {
    try {
      host = new URL(host).hostname;
    } catch {
      throw Error(`"${value.trim()}" is not a valid domain.`);
    }
  }
  host = host.replace(/^www\./, '');
  if (!domainPattern.test(host))
    throw Error(`"${value.trim()}" is not a valid domain.`);
  return host;
}

export function parseGrant(value: unknown): RunnerGrant | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') throw Error('Invalid plan grant.');
  const { domains, steps } = value as { domains?: unknown; steps?: unknown };
  if (!Array.isArray(domains) || domains.length < 1 || domains.length > 5)
    throw Error('A plan grant names one to five domains.');
  const hosts = [
    ...new Set(
      domains.map((item) => {
        if (typeof item !== 'string') throw Error('Invalid plan grant domain.');
        return grantDomain(item);
      }),
    ),
  ];
  const budget = steps === undefined ? MAX_GRANT_STEPS : steps;
  if (
    typeof budget !== 'number' ||
    !Number.isInteger(budget) ||
    budget < MIN_GRANT_STEPS ||
    budget > MAX_GRANT_STEPS
  )
    throw Error(`Plan grant steps must be ${MIN_GRANT_STEPS}–${MAX_GRANT_STEPS}.`);
  return { domains: hosts, steps: budget };
}
