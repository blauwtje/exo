// How exo resolves one setting through its four layers, highest first:
// `.claude/exo.local.json`, `.claude/exo.json`, the global layer (the plugin's
// options on Claude Code, `${CODEX_HOME:-~/.codex}/exo/settings.json` on Codex),
// then the schema default. skills/configure/scripts/settings.mjs runs its CLI at
// module scope, so a hook that reads a setting on every call imports the
// resolution from here instead of spawning `settings.mjs get`; both read it
// here, the way lib/memory-store.mjs is shared.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { configDirectory } from '#config-directory';
import { currentHost } from '#host';

export const SCHEMA = JSON.parse(fs.readFileSync(new URL('../skills/configure/schema.json', import.meta.url), 'utf8'));
export const PROJECT_FILE = path.join('.claude', 'exo.json');
export const LOCAL_FILE = path.join('.claude', 'exo.local.json');
const PLUGIN_PREFIX = 'exo@';
const CLAUDE_GLOBAL_SOURCE = '/config';

// The Codex global layer is a flat `{ "<key>": <value> }` object in Codex's own home.
export function codexSettingsFile() {
  return path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'exo', 'settings.json');
}

// Where a global value is changed: `/config` on Claude Code, the file itself on Codex.
export function globalSource() {
  return currentHost() === 'codex' ? codexSettingsFile() : CLAUDE_GLOBAL_SOURCE;
}

export function projectRoot() {
  if (process.env.CLAUDE_PROJECT_DIR) return process.env.CLAUDE_PROJECT_DIR;
  const toplevel = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (toplevel.status === 0) return toplevel.stdout.trim();
  return process.cwd();
}

export function unknownKey(key) {
  return new Error(`unknown setting ${key}; known: ${Object.keys(SCHEMA).join(', ')}`);
}

// A missing file is an empty layer; a file that does not parse throws, because
// a broken shared file read as empty hides every value in it.
export function readLayer(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
  let values;
  try {
    values = JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${error.message}`);
  }
  if (values === null || typeof values !== 'object' || Array.isArray(values)) {
    throw new Error(`${file} is not a JSON object`);
  }
  return values;
}

// The user settings file can exist yet be closed to this process, as under an OS
// sandbox that denies reads of the config directory. The other layers still apply,
// and the note names the file so its values are not mistaken for defaults.
function readUserSettings() {
  const file = path.join(configDirectory(), 'settings.json');
  try {
    return { userSettings: readLayer(file), unreadable: null };
  } catch (error) {
    if (error.code !== 'EACCES' && error.code !== 'EPERM') throw error;
    return { userSettings: {}, unreadable: `${file} could not be read (${error.code}); a global value it holds shows as default` };
  }
}

// An unreadable or malformed Codex file yields defaults for this layer plus a
// note naming the file, as the unreadable Claude file does.
function codexGlobalLayer() {
  const file = codexSettingsFile();
  try {
    return { values: readLayer(file), unreadable: null };
  } catch (error) {
    return { values: {}, unreadable: `${error.message.startsWith(file) ? error.message : `${file}: ${error.message}`}; a global value it holds shows as default` };
  }
}

// A hook process receives CLAUDE_PLUGIN_OPTION_<KEY>; any other caller reads the
// same value from the user settings file the harness stores plugin options in.
function globalLayer() {
  if (currentHost() === 'codex') return codexGlobalLayer();
  const { userSettings, unreadable } = readUserSettings();
  const pluginConfigs = userSettings.pluginConfigs !== null && typeof userSettings.pluginConfigs === 'object' ? userSettings.pluginConfigs : {};
  const pluginId = Object.keys(pluginConfigs).find((id) => id.startsWith(PLUGIN_PREFIX));
  const options = pluginId === undefined ? undefined : pluginConfigs[pluginId]?.options;
  const stored = options !== null && typeof options === 'object' ? options : {};
  const values = {};
  for (const key of Object.keys(SCHEMA)) {
    const fromHook = process.env[`CLAUDE_PLUGIN_OPTION_${key.toUpperCase()}`];
    if (fromHook !== undefined && fromHook !== '') {
      values[key] = fromHook;
    } else if (stored[key] !== undefined) {
      values[key] = stored[key];
    }
  }
  return { values, unreadable };
}

// The command line and the hook environment hand every value over as a string,
// and the harness stores a number option as one too.
export function typedValue(key, value) {
  if (SCHEMA[key].type !== 'number' || typeof value !== 'string') return value;
  if (!/^\d+$/.test(value)) return value;
  return Number(value);
}

export function invalidReason(key, value) {
  const entry = SCHEMA[key];
  if (typeof value !== entry.type) return `${key}=${value} is not a ${entry.type}`;
  const min = entry.min ?? 1;
  if (entry.type === 'number' && !(Number.isSafeInteger(value) && value >= min)) {
    return `${key}=${value} is not a whole number of at least ${min}`;
  }
  if (entry.options && !entry.options.includes(value)) {
    return `${key}=${value} is not one of ${entry.options.join(', ')}`;
  }
  return null;
}

export function layers(root) {
  return [
    { name: 'local', source: LOCAL_FILE, values: readLayer(path.join(root, LOCAL_FILE)) },
    { name: 'project', source: PROJECT_FILE, values: readLayer(path.join(root, PROJECT_FILE)) },
    { name: 'global', source: globalSource(), ...globalLayer() }
  ];
}

// A setting that renamed a value keeps its old names in the schema's `aliases`
// map, so a stored old value reads as the new one.
function canonicalValue(key, value) {
  const aliases = SCHEMA[key].aliases;
  return aliases && Object.hasOwn(aliases, value) ? aliases[value] : value;
}

// A number is a threshold a hook reads on every call, so a stored one that is
// not a whole number of at least its `min` (1 when the entry names none) falls
// through to the next layer instead of stopping the hook; the note it leaves
// names the file so the bad value is not mistaken for a deliberate default.
export function resolve(key, stack) {
  const notes = [];
  for (const layer of stack) {
    if (layer.values[key] === undefined) continue;
    const value = canonicalValue(key, typedValue(key, layer.values[key]));
    const problem = invalidReason(key, value);
    if (problem && SCHEMA[key].type === 'number') {
      notes.push(`${layer.source}: ${problem}`);
      continue;
    }
    if (problem) throw new Error(`${layer.source}: ${problem}`);
    return { value, layer: layer.name, notes };
  }
  return { value: SCHEMA[key].default, layer: 'default', notes };
}

// The effective value `settings.mjs get` prints. It throws on an unknown key
// and on a layer file that does not parse or is not a JSON object.
export function settingValue(key) {
  if (!Object.hasOwn(SCHEMA, key ?? '')) throw unknownKey(key);
  return resolve(key, layers(projectRoot())).value;
}
