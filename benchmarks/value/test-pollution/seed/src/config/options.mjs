import { DEFAULTS } from './defaults.mjs';

const KNOWN = new Set(Object.keys(DEFAULTS));

export function resolveOptions(tenant) {
  const overrides = tenant?.options ?? {};
  for (const key of Object.keys(overrides)) {
    if (!KNOWN.has(key)) throw new Error(`unknown option "${key}"`);
  }
  return Object.assign(DEFAULTS, overrides);
}

export function describeOptions(tenant) {
  const options = resolveOptions(tenant);
  return Object.entries(options)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}
