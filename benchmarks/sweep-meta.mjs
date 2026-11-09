import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { readJson } from './basics.mjs';
import { ROOT } from './tasks.mjs';

function git(directory, args) {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function commitOf(directory) {
  return git(directory, ['rev-parse', 'HEAD']).trim();
}

function isDirty(directory) {
  return git(directory, ['status', '--porcelain']).trim() !== '';
}

export function pluginCommits(base = null) {
  const commits = { [ROOT]: commitOf(ROOT) };
  if (base === null) return commits;
  commits[base] = commitOf(base);
  return commits;
}

export function readOrWriteMeta(runDirectory, options, cellCount) {
  const file = path.join(runDirectory, 'meta.json');
  if (fs.existsSync(file)) return readJson(file);
  const base = options.base ?? null;
  const meta = {
    date: new Date().toISOString().slice(0, 10),
    claudeVersion: execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim(),
    node: process.version,
    pluginCommits: pluginCommits(base),
    pluginDirty: isDirty(ROOT),
    sets: options.sets,
    provider: options.provider,
    baseline: options.baseline,
    cells: cellCount
  };
  if (base !== null) meta.baseDirty = isDirty(base);
  fs.writeFileSync(file, `${JSON.stringify(meta, null, 2)}\n`);
  return meta;
}
