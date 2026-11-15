#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { isMain, parseFlags } from '#script-flags';
import { gitLine } from '#git';
import { CLI, PLUGIN_ROOT } from './run-session-paths.mjs';
import { planPathFrom } from './ci-plan-path.mjs';

export const RESULT_REF = 'exo-result';
export const BUNDLE_FILE = 'result.bundle';

function branchesAhead(root, base) {
  const names = gitLine(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']) ?? '';
  return names.split('\n').filter((name) => name !== '' && name !== RESULT_REF && gitLine(root, ['rev-list', '--count', `${base}..${name}`]) !== '0');
}

function bundleResult(root, base, directory) {
  const ahead = branchesAhead(root, base);
  if (ahead.length !== 1) return { branch: null, ahead };
  fs.mkdirSync(directory, { recursive: true });
  gitLine(root, ['branch', '-f', RESULT_REF, ahead[0]]);
  const file = path.join(directory, BUNDLE_FILE);
  const made = gitLine(root, ['bundle', 'create', file, RESULT_REF, `^${base}`]);
  return { branch: made === null ? null : ahead[0], ahead };
}

function fail(message) {
  process.stderr.write(`exo: ${message}\n`);
  return 2;
}

function headCommit(root) {
  return spawnSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
}

function report(name, value) {
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function runPlan(root, plan, resultDirectory) {
  if (planPathFrom(`/exo run ${plan}`) === null) return fail(`refused plan path ${JSON.stringify(plan)}`);
  const base = headCommit(root);
  const ran = spawnSync(process.execPath, [CLI, 'run', plan, '--plugin-dir', PLUGIN_ROOT], { cwd: root, stdio: 'inherit' });
  if (ran.status !== 0) return ran.status ?? 1;
  const { branch, ahead } = bundleResult(root, base, resultDirectory);
  if (branch === null) return fail(`the run left ${ahead.length} branches ahead of ${base}, not one; nothing to push`);
  report('has-result', 'true');
  return 0;
}

if (isMain(import.meta.url)) {
  parseFlags(process.argv.slice(2), {}, { usage: 'usage: EXO_PLAN=<plan path> EXO_RESULT_DIR=<dir> ci-run.mjs; runs exo run on the plan and bundles the one branch it left' });
  const resultDirectory = process.env.EXO_RESULT_DIR;
  if (!resultDirectory) process.exit(fail('EXO_RESULT_DIR is not set'));
  process.exitCode = runPlan(process.cwd(), process.env.EXO_PLAN ?? '', resultDirectory);
}
