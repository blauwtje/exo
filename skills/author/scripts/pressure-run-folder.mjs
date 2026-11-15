import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CASE_ROOT = '/tmp/exo-pressure';

function caseFolder(setupScript) {
  return path.join(CASE_ROOT, path.basename(path.dirname(setupScript)));
}

function runGit(cwd, args) {
  const run = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${run.stderr.trim()}`);
  return run.stdout.trim();
}

function hostGitSetting(key, placeholder) {
  const run = spawnSync('git', ['config', '--get', key], { encoding: 'utf8' });
  const value = run.status === 0 ? run.stdout.trim() : '';
  return value === '' ? placeholder : value;
}

function initRepository(scratch) {
  const identity = { name: hostGitSetting('user.name', 'pressure'), email: hostGitSetting('user.email', 'pressure@localhost') };
  runGit(scratch, ['init', '--quiet']);
  runGit(scratch, ['config', 'user.name', identity.name]);
  runGit(scratch, ['config', 'user.email', identity.email]);
  runGit(scratch, ['-c', 'commit.gpgsign=false', 'commit', '--quiet', '--allow-empty', '-m', 'pressure start']);
}

export function makeRunFolder(armName, setupScript) {
  const runFolder = fs.mkdtempSync(path.join(os.tmpdir(), `pressure-${armName}-`));
  const [scratch, tmp] = ['scratch', 'tmp'].map((name) => path.join(runFolder, name));
  for (const dir of [scratch, tmp]) fs.mkdirSync(dir);
  initRepository(scratch);
  const roots = [scratch, tmp];
  if (setupScript !== undefined) {
    const runCase = caseFolder(setupScript);
    fs.mkdirSync(runCase, { recursive: true });
    roots.push(runCase);
  }
  return { scratch, tmp, roots };
}
