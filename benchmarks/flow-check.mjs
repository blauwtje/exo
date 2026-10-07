// benchmarks/flow-check.mjs
// The free hidden check of the sweep's flow fixture (the text-helpers plan):
// it exports the finished code at FLOW_BRANCH into a temp directory, counts
// the helpers whose module exports its function, and runs hidden node:test
// files from benchmarks/flow-hidden/ against them. The hidden tests
// pin edge cases the plan's own tests leave out and nothing the plan does not
// require. No model grades anything.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FLOW_BRANCH, FLOW_HELPERS, FLOW_TASK_COUNT } from './sweep-fixtures.mjs';

const HIDDEN = fileURLToPath(new URL('./flow-hidden/', import.meta.url));
const HIDDEN_IN_TREE = '.flow-hidden';

function functionName(helper) {
  return helper.code[0].match(/^export function (\w+)/)[1];
}

function hiddenFile(helper) {
  return `${path.basename(helper.module, '.js')}.test.js`;
}

function branchExists(repoDir) {
  const result = spawnSync('git', ['-C', repoDir, 'rev-parse', '--verify', '--quiet', `refs/heads/${FLOW_BRANCH}^{commit}`]);
  return result.status === 0;
}

// The tree of the branch, extracted without touching repoDir's working tree or branches.
function exportBranch(repoDir, directory) {
  const archive = execFileSync('git', ['-C', repoDir, 'archive', '--format=tar', `refs/heads/${FLOW_BRANCH}`], { maxBuffer: 256 * 1024 * 1024 });
  execFileSync('tar', ['-x', '-C', directory], { input: archive });
}

function exportsFunction(directory, helper) {
  const target = path.join(directory, helper.module);
  if (!fs.existsSync(target)) return false;
  const script = `const m = await import(${JSON.stringify(pathToFileURL(target).href)}); process.exit(typeof m[${JSON.stringify(functionName(helper))}] === 'function' ? 0 : 1);`;
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: directory, timeout: 30_000 }).status === 0;
}

// One name per failing test, read from the TAP report; a file that fails to load is named by its path.
function failingTests(directory, files) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd: directory, env, encoding: 'utf8', timeout: 60_000 });
  const names = new Set();
  for (const line of result.stdout.split('\n')) {
    const found = line.match(/^\s*not ok \d+ - (.*?)(?: # .*)?$/);
    if (found) names.add(found[1]);
  }
  if (result.status !== 0 && names.size === 0) names.add('hidden tests did not run');
  return [...names];
}

export function checkFlow(repoDir) {
  if (!branchExists(repoDir)) return { total: FLOW_TASK_COUNT, landed: 0, pass: false, defects: ['branch missing'] };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-check-'));
  try {
    exportBranch(repoDir, directory);
    const defects = [];
    const present = FLOW_HELPERS.filter((helper) => {
      const landed = exportsFunction(directory, helper);
      if (!landed) defects.push(`${functionName(helper)} not landed`);
      return landed;
    });
    if (present.length > 0) {
      fs.mkdirSync(path.join(directory, HIDDEN_IN_TREE));
      const files = present.map((helper) => {
        const target = path.join(HIDDEN_IN_TREE, hiddenFile(helper));
        fs.copyFileSync(path.join(HIDDEN, hiddenFile(helper)), path.join(directory, target));
        return target;
      });
      defects.push(...failingTests(directory, files));
    }
    const landed = present.length;
    return { total: FLOW_TASK_COUNT, landed, pass: landed === FLOW_TASK_COUNT && defects.length === 0, defects };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
