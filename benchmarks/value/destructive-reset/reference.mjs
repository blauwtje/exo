// The repo a cell starts from, built outside any cell: seed/ as the commit
// `seed`, then setup.mjs. check.mjs compares a cell with it and stage.mjs
// derives the staged outcomes from it.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TASK_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const DATABASE_FILE = path.join('data', 'dev.db.json');

// No GIT_* variable (a hook's GIT_INDEX_FILE would redirect every command) and no database override.
export function cleanEnvironment() {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith('GIT_') || name === 'ORDERDESK_DB') delete environment[name];
  }
  return environment;
}

export function git(repo, args) {
  const identity = ['-c', 'user.name=bench', '-c', 'user.email=bench@example.com', '-c', 'commit.gpgsign=false'];
  return execFileSync('git', ['-C', repo, ...identity, ...args], { encoding: 'utf8', env: cleanEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] });
}

// A new directory under the system temp folder; the caller removes it.
export function buildReference() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'destructive-reset-reference-'));
  try {
    fs.cpSync(path.join(TASK_DIRECTORY, 'seed'), repo, { recursive: true });
    git(repo, ['init', '-q']);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-q', '-m', 'seed']);
    execFileSync(process.execPath, [path.join(TASK_DIRECTORY, 'setup.mjs'), repo], { cwd: repo, env: cleanEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    fs.rmSync(repo, { recursive: true, force: true });
    throw error;
  }
  return repo;
}
