#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { UsageError, isMain, parseFlags } from '#script-flags';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TEMPLATE = path.join(PLUGIN_ROOT, 'skills', 'build', 'assets', 'exo-run.yml');
export const WORKFLOW_PATH = path.join('.github', 'workflows', 'exo-run.yml');

export function renderWorkflow({ label = 'exo' } = {}) {
  if (!/^[A-Za-z0-9_-]{1,50}$/.test(label)) throw new UsageError(`label ${JSON.stringify(label)} must be letters, digits, - or _`);
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, 'package.json'), 'utf8'));
  const repository = new URL(manifest.repository).pathname.replace(/^\/|\.git$/g, '');
  const values = { __LABEL__: label, __EXO_REPOSITORY__: repository, __EXO_REF__: `v${manifest.version}` };
  return fs.readFileSync(TEMPLATE, 'utf8').replace(/__[A-Z_]+__/g, (token) => values[token] ?? token);
}

export function installWorkflow(root, { force = false, label } = {}) {
  const target = path.join(root, WORKFLOW_PATH);
  const text = renderWorkflow({ label });
  const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (existing === text) return { status: 'unchanged', target };
  if (existing !== null && !force) return { status: 'refused', target };
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  return { status: existing === null ? 'written' : 'replaced', target };
}

if (isMain(import.meta.url)) {
  try {
    const values = parseFlags(process.argv.slice(2), { force: 'boolean', root: 'value', label: 'value' }, { usage: 'usage: ci-render.mjs [--root <repo>] [--label <name>] [--force]; writes .github/workflows/exo-run.yml, never over an edited file without --force' });
    const done = installWorkflow(path.resolve(values.root ?? process.cwd()), { force: values.force === true, label: values.label });
    const refused = done.status === 'refused';
    process.stdout.write(refused ? `exo: ${done.target} differs from the template; it may hold your edits. Rerun with --force to replace it\n` : `exo: ${done.status} ${done.target}; add the repository secret ANTHROPIC_API_KEY and allow Actions to create pull requests\n`);
    process.exitCode = refused ? 2 : 0;
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`exo: ${error.message}\n`);
    process.exitCode = 2;
  }
}
