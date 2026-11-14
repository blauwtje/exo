#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { codexHookTargets } from './hooks.mjs';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const target = process.argv[2];

let listed = [];
try {
  listed = codexHookTargets(root);
} catch (error) {
  console.error(`hook-entry: ${error.message}`);
  process.exit(1);
}
if (process.argv.length !== 3 || !listed.includes(target)) {
  console.error(`hook-entry: refused ${JSON.stringify(target)}, which is not a listed hook script`);
  process.exit(1);
}

process.env.EXO_HOST = 'codex';
process.env.CLAUDE_PLUGIN_ROOT = root;
const script = path.join(root, target);
process.argv = [process.argv[0], script];
await import(pathToFileURL(script).href);
