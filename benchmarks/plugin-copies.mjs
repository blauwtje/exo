import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ARMS, ROOT } from './tasks.mjs';
import { pluginDirty } from './plugin-state.mjs';
import { applyVariant } from './variants.mjs';
import { copyPluginWithoutTasks } from './value.mjs';

export const BEFORE_ARM = 'exo-before';

export function beforeArm(dir) {
  return { prompt: null, pluginDirs: [dir], promptSuffix: null, exoRoot: dir };
}

export function withBeforeArm(arms, dir) {
  return dir === null || dir === undefined ? arms : { ...arms, [BEFORE_ARM]: beforeArm(dir) };
}

export function exoRootOf(arm) {
  return arm.exoRoot ?? (arm.pluginDirs.includes(ROOT) ? ROOT : null);
}

export function copyKey(arm) {
  const base = arm.variant ?? 'plain';
  return arm.exoRoot === undefined ? base : `before:${base}`;
}

export function loadsCopy(arm, task) {
  return exoRootOf(arm) !== null && (task.tier === 'value' || arm.variant !== undefined);
}

export function resolveDirectory(dir) {
  const absolute = path.resolve(dir);
  return fs.existsSync(absolute) ? fs.realpathSync(absolute) : absolute;
}

function makeCopyDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'exo-bench-plugin-'));
}

export function buildCopies(cells, arms = ARMS, makeDirectory = makeCopyDirectory) {
  const copies = {};
  for (const cell of cells) {
    const arm = arms[cell.arm];
    if (!loadsCopy(arm, cell.task) || copyKey(arm) in copies) continue;
    copies[copyKey(arm)] = copyPluginWithoutTasks(exoRootOf(arm), makeDirectory());
    if (arm.variant) applyVariant(arm.variant, copies[copyKey(arm)]);
  }
  return copies;
}

function pluginName(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8')).name;
  } catch {
    return null;
  }
}

function isGitCheckout(dir) {
  try {
    execFileSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function beforePluginProblem(dir, armNames) {
  const wantsArm = armNames.includes(BEFORE_ARM);
  if (dir === undefined || dir === '') return '--before-plugin needs a directory';
  if (dir === null) return wantsArm ? `arm ${BEFORE_ARM} needs --before-plugin <dir>` : null;
  if (!wantsArm) return `--before-plugin needs arm ${BEFORE_ARM} in --arms`;
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return `--before-plugin ${dir}: no such directory`;
  const resolved = resolveDirectory(dir);
  const name = pluginName(ROOT);
  if (name === null || pluginName(resolved) !== name) return `--before-plugin ${dir}: not an exo plugin (no .claude-plugin/plugin.json naming exo)`;
  if (resolved === resolveDirectory(ROOT)) return `--before-plugin ${dir} is this checkout; give a worktree at the before commit`;
  if (!isGitCheckout(resolved)) return `--before-plugin ${dir}: not a git checkout`;
  if (pluginDirty([resolved])[resolved]) return `--before-plugin ${dir} has uncommitted changes; the copy would not match its commit`;
  return null;
}
