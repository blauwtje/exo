import { readFileSync } from 'node:fs';

export const DEFAULTS = { theme: 'light', pageSize: 20 };

function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function parseObject(file, text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid settings file ${file}: ${error.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`settings file ${file} must hold a JSON object`);
  }
  return parsed;
}

export function loadSettings(file) {
  const text = readText(file);
  if (text === undefined) return { ...DEFAULTS };
  return { ...DEFAULTS, ...parseObject(file, text) };
}
