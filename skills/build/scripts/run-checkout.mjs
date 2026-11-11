import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { createWorktree, worktreePath } from '#checkout';
import { defaultBranch, gitLine, gitResult } from '#git';
import { readPluginRoot } from '#plugin-pointer';
import { Refusal } from './cli-refusal.mjs';

function dirtyFiles(root) {
  const answer = spawnSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' });
  return answer.status === 0 ? answer.stdout.split('\n').filter(Boolean).map((line) => line.slice(3)) : [];
}

export function putOnBranch(root, wanted) {
  if (gitLine(root, ['symbolic-ref', '-q', '--short', 'HEAD']) === wanted) return;
  const exists = gitLine(root, ['rev-parse', '-q', '--verify', `refs/heads/${wanted}`]) !== null;
  let args = ['switch', wanted];
  if (!exists) {
    const base = defaultBranch(root);
    if (base === null) throw new Refusal(`branch ${wanted} is missing and the checkout has no default branch to create it from`);
    args = ['switch', '-c', wanted, base];
  }
  const done = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (done.status !== 0) throw new Refusal(`git ${args.join(' ')} failed: ${done.stderr.trim()}`);
}

export function worktreeFor(root, wanted) {
  const held = worktrees(root).find((tree) => tree.branch === wanted);
  if (held?.main) throw new Refusal(`branch ${wanted} is checked out in the main checkout ${held.path}, which the loaded exo runs from; run git switch ${defaultBranch(root) ?? '<default branch>'} there first`);
  if (held !== undefined) return held.path;
  const where = worktreePath(wanted.replaceAll('/', '-'), root);
  const exists = gitLine(root, ['rev-parse', '-q', '--verify', `refs/heads/${wanted}`]) !== null;
  const base = defaultBranch(root);
  if (!exists && base === null) throw new Refusal(`branch ${wanted} is missing and the checkout has no default branch to create it from`);
  const args = exists ? [where, wanted] : ['-b', wanted, where, base];
  const done = createWorktree(root, where, args);
  if (!done.ok) throw new Refusal(done.failure);
  return where;
}

function pluginPointer() {
  return readPluginRoot(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'), 'exo'));
}

export function isPluginCheckout(root) {
  try {
    return fs.realpathSync(pluginPointer()) === fs.realpathSync(root);
  } catch {
    return false;
  }
}

export function refuseLoadedCheckout(root, script) {
  const loaded = fs.realpathSync(path.resolve(path.dirname(script), '..', '..', '..'));
  if (fs.realpathSync(root) !== loaded) return;
  throw new Refusal(`refused: ${root} is the checkout exo loads from (${loaded}), and the plugin-root pointer is ${pluginPointer() ?? 'none'}; a run here would edit the code it runs, so run from a worktree or another checkout`);
}

export function worktrees(root) {
  const list = gitResult(root, ['worktree', 'list', '--porcelain']).text.split('\n\n').filter(Boolean);
  return list.map((block, index) => ({
    path: /^worktree (.+)$/m.exec(block)[1],
    branch: /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? null,
    main: index === 0
  }));
}

export function refuseDirty(root) {
  const files = dirtyFiles(root);
  if (files.length > 0) {
    const list = files.join(' ');
    throw new Refusal(`refused: uncommitted edits in ${list}; commit them, or discard with git restore --staged --worktree -- ${list}`);
  }
}
