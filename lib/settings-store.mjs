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

export function codexSettingsFile() {
  return path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'exo', 'settings.json');
}

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

function readUserSettings() {
  const file = path.join(configDirectory(), 'settings.json');
  try {
    return { userSettings: readLayer(file), unreadable: null };
  } catch (error) {
    if (error.code !== 'EACCES' && error.code !== 'EPERM') throw error;
    return { userSettings: {}, unreadable: `${file} could not be read (${error.code}); a global value it holds shows as default` };
  }
}

function codexGlobalLayer() {
  const file = codexSettingsFile();
  try {
    return { values: readLayer(file), unreadable: null };
  } catch (error) {
    return { values: {}, unreadable: `${error.message.startsWith(file) ? error.message : `${file}: ${error.message}`}; a global value it holds shows as default` };
  }
}

function globalLayer() {
  if (currentHost() === 'codex') return codexGlobalLayer();
  const { userSettings, unreadable } = readUserSettings();
  const pluginConfigs = userSettings.pluginConfigs !== null && typeof userSettings.pluginConfigs === 'object' ? userSettings.pluginConfigs : {};
  const pluginId = Object.keys(pluginConfigs).find((id) => id.startsWith(PLUGIN_PREFIX));
  const options = pluginId === undefined ? undefined : pluginConfigs[pluginId]?.options;
  const stored = options !== null && typeof options === 'object' ? options : {};
  const values = {};
  for (const key of [...Object.keys(SCHEMA), ...Object.values(SCHEMA).map((entry) => entry.legacy?.key).filter(Boolean)]) {
    const fromHook = process.env[`CLAUDE_PLUGIN_OPTION_${key.toUpperCase()}`];
    if (fromHook !== undefined && fromHook !== '') {
      values[key] = fromHook;
    } else if (stored[key] !== undefined) {
      values[key] = stored[key];
    }
  }
  return { values, unreadable };
}

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

function canonicalValue(key, value) {
  const aliases = SCHEMA[key].aliases;
  return aliases && Object.hasOwn(aliases, value) ? aliases[value] : value;
}

export function resolve(key, stack) {
  const notes = [];
  const legacy = SCHEMA[key].legacy;
  for (const layer of stack) {
    if (layer.values[key] === undefined && legacy && layer.values[legacy.key] !== undefined) {
      const stored = layer.values[legacy.key];
      if (!Object.hasOwn(legacy.values, stored)) {
        throw new Error(`${layer.source}: ${legacy.key}=${stored} is not one of ${Object.keys(legacy.values).join(', ')}`);
      }
      return { value: legacy.values[stored], layer: layer.name, notes };
    }
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

export function settingValue(key) {
  if (!Object.hasOwn(SCHEMA, key ?? '')) throw unknownKey(key);
  return resolve(key, layers(projectRoot())).value;
}
