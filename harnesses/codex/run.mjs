#!/usr/bin/env node
// The command every script call in a generated Codex skill or agent runs:
// `node harnesses/codex/run.mjs skills/<name>/scripts/<file>.mjs <args>`.
// Codex gives those commands neither the exo root nor the host, so this sets
// EXO_HOST=codex and CLAUDE_PLUGIN_ROOT, then imports the script as the process entry.
// The root is this file's own location, never an argument or an inherited variable.
// Only a `skills/<name>/scripts/*.mjs` file is run: the argument must have that shape
// and its real path, after symlinks, must have it inside the real root, else exit 1
// before any import.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const SKILL_SCRIPT = /^skills\/[^/\\]+\/scripts\/[^/\\]+\.mjs$/;

function refuse(reason) {
  console.error(`run: ${reason}`);
  process.exit(1);
}

function isSkillScript(relative) {
  const parts = relative.split('/');
  return SKILL_SCRIPT.test(relative) && !parts.includes('..') && !parts.includes('.');
}

const target = process.argv[2];
if (typeof target !== 'string' || !isSkillScript(target)) {
  refuse(`refused ${JSON.stringify(target)}, which is not a skills/<name>/scripts/*.mjs path`);
}

let real;
let realRoot;
try {
  realRoot = fs.realpathSync(root);
  real = fs.realpathSync(path.join(realRoot, target));
  if (!fs.statSync(real).isFile()) throw new Error('not a file');
} catch {
  refuse(`refused ${JSON.stringify(target)}, which is not a file in the exo root`);
}
const inside = path.relative(realRoot, real).split(path.sep).join('/');
if (!isSkillScript(inside)) {
  refuse(`refused ${JSON.stringify(target)}, which resolves outside the skill scripts`);
}

process.env.EXO_HOST = 'codex';
process.env.CLAUDE_PLUGIN_ROOT = root;
// The scripts find their own file and the root through argv[1].
process.argv = [process.argv[0], real, ...process.argv.slice(3)];
await import(pathToFileURL(real).href);
