#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { UsageError, isMain, parseFlags, USAGE_EXIT } from '#script-flags';
import { PLUGIN_ROOT } from './run-session-paths.mjs';

const TEMPLATE = path.join(PLUGIN_ROOT, 'skills', 'build', 'assets', 'exo-run.yml');
const WORKFLOW_PATH = path.join('.github', 'workflows', 'exo-run.yml');

function renderWorkflow() {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'package.json'), 'utf8'));
  const repository = new URL(manifest.repository).pathname.replace(/^\/|\.git$/g, '');
  const values = { __LABEL__: 'exo', __EXO_REPOSITORY__: repository, __EXO_REF__: `v${manifest.version}` };
  return fs.readFileSync(TEMPLATE, 'utf8').replace(/__[A-Z_]+__/g, (token) => values[token] ?? token);
}

function installWorkflow(root, force) {
  const target = path.join(root, WORKFLOW_PATH);
  const text = renderWorkflow();
  const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (existing === text) return { status: 'unchanged', target };
  if (existing !== null && !force) return { status: 'refused', target };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  return { status: existing === null ? 'written' : 'replaced', target };
}

function runCli(argv) {
  const values = parseFlags(argv, { force: 'boolean' }, { usage: 'usage: ci-render.mjs [--force]; writes .github/workflows/exo-run.yml, never over an edited file without --force' });
  const done = installWorkflow(process.cwd(), values.force === true);
  const refused = done.status === 'refused';
  process.stdout.write(refused ? `exo: ${done.target} differs from the template; it may hold your edits. Rerun with --force to replace it\n` : `exo: ${done.status} ${done.target}; add the repository secret ANTHROPIC_API_KEY and allow Actions to create pull requests\n`);
  process.exitCode = refused ? 2 : 0;
}

if (isMain(import.meta.url)) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`exo: ${error.message}\n`);
    process.exitCode = USAGE_EXIT;
  }
}
