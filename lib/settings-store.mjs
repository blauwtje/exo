import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { configDirectory } from '#config-directory';

export const SCHEMA = JSON.parse(fs.readFileSync(new URL('../.claude-plugin/plugin.json', import.meta.url), 'utf8')).userConfig;
const PLUGIN_PREFIX = 'exo@';
const GLOBAL_SOURCE = '/config';

function unknownKey(key) {
  return new Error(`unknown setting ${key}; known: ${Object.keys(SCHEMA).join(', ')}`);
}

function readLayer(file) {
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
  try {
    return readLayer(path.join(configDirectory(), 'settings.json'));
  } catch (error) {
    if (error.code !== 'EACCES' && error.code !== 'EPERM') throw error;
    return {};
  }
}

function globalLayer() {
  const userSettings = readUserSettings();
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
  return values;
}

function typedValue(key, value) {
  if (SCHEMA[key].type !== 'number' || typeof value !== 'string') return value;
  if (!/^\d+$/.test(value)) return value;
  return Number(value);
}

function invalidReason(key, value) {
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

function canonicalValue(key, value) {
  const aliases = SCHEMA[key].aliases;
  return aliases && Object.hasOwn(aliases, value) ? aliases[value] : value;
}

function legacyResolution(key, layer) {
  const legacy = SCHEMA[key].legacy;
  if (layer.values[key] !== undefined || !legacy || layer.values[legacy.key] === undefined) return null;
  const stored = layer.values[legacy.key];
  if (!Object.hasOwn(legacy.values, stored)) {
    throw new Error(`${layer.source}: ${legacy.key}=${stored} is not one of ${Object.keys(legacy.values).join(', ')}`);
  }
  return { value: legacy.values[stored], layer: layer.name };
}

function resolve(key, stack) {
  const notes = [];
  for (const layer of stack) {
    const legacyHit = legacyResolution(key, layer);
    if (legacyHit !== null) return { ...legacyHit, notes };
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
  return resolve(key, [{ name: 'global', source: GLOBAL_SOURCE, values: globalLayer() }]).value;
}
