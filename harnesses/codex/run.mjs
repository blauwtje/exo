#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const SKILL_SCRIPT = /^skills\/[^/\\]+\/scripts\/[^/\\]+\.mjs$/;
const LIB_ENTRIES = new Set([
  'lib/mcp-tool-call.mjs',
  'lib/scratch-exclude.mjs',
  'lib/scratch-path.mjs',
  'lib/size-facts.mjs',
  'lib/workspace.mjs'
]);

function refuse(reason) {
  console.error(`run: ${reason}`);
  process.exit(1);
}

function isSkillScript(relative) {
  const parts = relative.split('/');
  return (SKILL_SCRIPT.test(relative) || LIB_ENTRIES.has(relative)) && !parts.includes('..') && !parts.includes('.');
}

let realRoot;
try {
  realRoot = fs.realpathSync(root);
} catch {
  refuse('refused the exo root, which is not readable');
}

function relativeToRoot(argument) {
  if (typeof argument !== 'string' || !path.isAbsolute(argument)) return argument;
  try {
    return path.relative(realRoot, fs.realpathSync(argument)).split(path.sep).join('/');
  } catch {
    return argument;
  }
}

const target = relativeToRoot(process.argv[2]);
if (typeof target !== 'string' || !isSkillScript(target)) {
  refuse(`refused ${JSON.stringify(target)}, which is not a skill script or a listed lib entry`);
}

let real;
try {
  real = fs.realpathSync(path.join(realRoot, target));
  if (!fs.statSync(real).isFile()) throw new Error('not a file');
} catch {
  refuse(`refused ${JSON.stringify(target)}, which is not a file in the exo root`);
}
const inside = path.relative(realRoot, real).split(path.sep).join('/');
if (!isSkillScript(inside)) {
  refuse(`refused ${JSON.stringify(target)}, which resolves outside the skill scripts and lib entries`);
}

process.env.EXO_HOST = 'codex';
process.env.CLAUDE_PLUGIN_ROOT = root;
process.argv = [process.argv[0], real, ...process.argv.slice(3)];
await import(pathToFileURL(real).href);
