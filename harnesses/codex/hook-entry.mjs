#!/usr/bin/env node
// The command every Codex hook entry runs: `node harnesses/codex/hook-entry.mjs <script>`.
// Codex gives hook commands neither the exo root nor the host, so this sets
// EXO_HOST=codex and CLAUDE_PLUGIN_ROOT, then imports the script as the process entry.
// The root is this file's own location, never an argument or an inherited
// variable, and the script must be one of the entries `harnesses/codex/hooks.mjs` lists:
// anything else is refused before it runs, with exit 1.

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
// The hook scripts find their own file and the root through argv[1].
const script = path.join(root, target);
process.argv = [process.argv[0], script];
await import(pathToFileURL(script).href);
