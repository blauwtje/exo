// Provider settings for `exo run`: the catalog this plugin ships, merged under
// the user's own <home>/.config/exo/run.json, plus the key file and the effort
// mapping. Pure functions; callers pass `home` so tests never touch the real one.

import fs from 'node:fs';
import path from 'node:path';

const CATALOG = new URL('../../../lib/run-providers.json', import.meta.url);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, over) {
  if (!isPlainObject(base) || !isPlainObject(over)) return over;
  const merged = { ...base };
  for (const [key, value] of Object.entries(over)) merged[key] = deepMerge(base[key], value);
  return merged;
}

export function configDir(home) {
  return path.join(home, '.config', 'exo');
}

export function loadRunConfig({ home }) {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  const file = path.join(configDir(home), 'run.json');
  if (!fs.existsSync(file)) return catalog;
  return deepMerge(catalog, JSON.parse(fs.readFileSync(file, 'utf8')));
}

export function readKeys(file) {
  const keys = {};
  if (!fs.existsSync(file)) return keys;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    keys[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return keys;
}

// Nearest accepted level in `order`; a tie goes to the higher level.
export function mapEffort(level, accepted, order) {
  if (accepted.includes(level)) return level;
  const at = order.indexOf(level);
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of accepted) {
    const distance = Math.abs(order.indexOf(candidate) - at);
    const index = order.indexOf(candidate);
    if (distance < bestDistance || (distance === bestDistance && index > order.indexOf(best))) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

export function resolveProvider(config, name, keys, effort, home) {
  const entry = config.providers[name];
  if (!entry) {
    const known = Object.keys(config.providers).join(', ');
    return { refused: `Unknown provider "${name}". Known: ${known}. Add one under "providers" in ${path.join(configDir(home ?? '~'), 'run.json')}.` };
  }
  if (entry.key && !keys[entry.key]) {
    return { refused: `Missing key for ${name}. Add the line ${entry.key}=<your key> to ${path.join(configDir(home ?? '~'), 'keys.env')}.` };
  }
  const env = {};
  for (const [variable, value] of Object.entries(entry.env ?? {})) {
    env[variable] = String(value).replace(/\$\{(\w+)\}/g, (_, ref) => keys[ref] ?? '');
  }
  const wanted = effort ?? config.defaults.effort;
  return {
    name,
    model: entry.model,
    effort: mapEffort(wanted, entry.efforts, config.efforts),
    env,
  };
}
