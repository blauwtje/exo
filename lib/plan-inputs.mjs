import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { alreadyApplied, definesRegion } from './plan-regions.mjs';

const INPUT_PATH = /`(\/[^`\s/]+\/[^`\s]*)`/g;

const PATTERN_TOKEN = /[{<*]|\/:/;

function realpathOrSelf(file) {
  try {
    return fs.realpathSync(file);
  } catch {
    return file;
  }
}

function localRoots() {
  const roots = [os.tmpdir(), '/tmp', os.homedir()];
  return [...new Set([...roots, ...roots.map(realpathOrSelf)])];
}

function underLocalRoot(token) {
  return localRoots().some((root) => token.startsWith(root.endsWith('/') ? root : `${root}/`));
}

function isFilePath(token) {
  if (PATTERN_TOKEN.test(token)) return false;
  return reachable(token) || underLocalRoot(token);
}

export function inputPaths(text) {
  return [...text.matchAll(INPUT_PATH)].map((match) => match[1]).filter(isFilePath);
}

const RELATIVE_PATH = /`([^`\s/][^`\s]*\/[^`\s]*)`/g;

// why: a gitignored input is absent from a fresh slot checkout; openSlots copies the ones git ignores.
export function relativeInputPaths(frame) {
  const texts = [...frame.assumptions, ...frame.context];
  return [...new Set(texts.flatMap((text) => [...text.matchAll(RELATIVE_PATH)].map((match) => match[1])))].filter((file) => !file.split('/').includes('..'));
}

function reachable(file) {
  try {
    fs.accessSync(file, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

// why: a builder in a wave slot sees only the brief; an input outside the checkout it cannot read gets written from memory.
function inputDrift(frame) {
  const inputs = new Set([...frame.assumptions, ...frame.context].flatMap(inputPaths));
  return [...inputs].filter((file) => !reachable(file)).map((file) => `input \`${file}\` is unreachable`);
}

export function isInputDrift(item) {
  return /^input `.*` is unreachable$/.test(item);
}

// why: a stop reason or report carries the drift item or the builder's BLOCKED phrase; headless repair skips both.
export const INPUT_UNREADABLE = 'input unreadable';
export function isUnreachableInput(text) {
  return /input `[^`]*` is unreachable/.test(text) || text.includes(INPUT_UNREADABLE);
}

export function driftOf(task, root, frame = null) {
  const drift = frame === null ? [] : inputDrift(frame);
  for (const file of task.files.filter((entry) => entry.kind === 'Modify')) {
    const target = path.join(root, file.path);
    if (!fs.existsSync(target)) {
      drift.push(`\`${file.path}\` is missing`);
      continue;
    }
    if (file.region === null) continue;
    const content = fs.readFileSync(target, 'utf8');
    const definitions = content.split('\n').filter((line) => definesRegion(line, file.region)).length;
    if (definitions === 0) drift.push(`region \`${file.region}\` is missing from \`${file.path}\``);
    else if (definitions > 1) drift.push(`region \`${file.region}\` is duplicated in \`${file.path}\``);
    else if (alreadyApplied(task.section, file.region, content)) drift.push(`region \`${file.region}\` is already changed in \`${file.path}\``);
  }
  return drift;
}
