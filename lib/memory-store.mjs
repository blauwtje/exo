import fs from 'node:fs';
import path from 'node:path';
import { commonDir } from '#checkout';
import { configDirectory } from '#config-directory';
import { gitLine } from '#git';
import { settingOrDefault } from '#settings-store';

export const ATTESTATIONS_REQUIRED = 2;

export function memoryDirectory(cwd) {
  const common = commonDir(cwd);
  if (common !== null) return path.join(common, 'exo');
  return path.join(configDirectory(), 'exo', 'memory', path.basename(path.resolve(cwd)));
}

function settingsRoot(cwd) {
  return gitLine(cwd, ['rev-parse', '--show-toplevel']) ?? path.resolve(cwd);
}

export function memoryOn(cwd) {
  return settingOrDefault('memory', settingsRoot(cwd)).value !== 'off';
}

export function stateFile(cwd) {
  return path.join(memoryDirectory(cwd), 'memory.json');
}

export function readState(cwd) {
  let text;
  try {
    text = fs.readFileSync(stateFile(cwd), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return { candidates: {}, lines: [], rejected: {} };
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`${stateFile(cwd)} is not valid JSON: ${error.message}`);
  }
  return { candidates: parsed.candidates ?? {}, lines: parsed.lines ?? [], rejected: parsed.rejected ?? {} };
}

export function isLive(line) {
  return line.superseded === null && line.dropped === null && line.retired == null;
}

export function isMemory(line) {
  return isLive(line) && line.decision !== true;
}

const GLOB_CHARACTERS = /[*?]/;

export const isGlob = (ref) => GLOB_CHARACTERS.test(ref);

export const refPath = (ref) => ref.split('#')[0];

function globPattern(glob) {
  const source = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '(?:.*/)?')
    .replace(/\u0001/g, '.*');
  return new RegExp(`^${source}$`);
}

export function refMatches(ref, file) {
  const target = refPath(ref).replace(/\/$/, '');
  if (isGlob(target)) return globPattern(target).test(file);
  return file === target || file.startsWith(`${target}/`);
}

const specificity = (line) => Math.max(...line.refs.map((ref) => (isGlob(ref) ? 0 : 1)), 0);

export function lessonsFor(cwd, files) {
  if (!memoryOn(cwd) || files.length === 0) return [];
  let state;
  try {
    state = readState(cwd);
  } catch {
    return [];
  }
  return state.lines
    .filter((line) => isMemory(line) && line.refs.some((ref) => files.some((file) => refMatches(ref, file))))
    .sort((left, right) => specificity(right) - specificity(left) || (left.written < right.written ? 1 : -1))
    .map((line) => line.claim);
}

export function lessonLines(cwd, files) {
  const claims = lessonsFor(cwd, files);
  return claims.length === 0 ? [] : ['Lessons for these paths:', ...claims.map((claim) => `- ${claim}`)];
}
