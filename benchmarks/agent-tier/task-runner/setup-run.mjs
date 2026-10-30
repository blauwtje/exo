import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { applyPrepared } from './stub.mjs';

const SKILL_SCRIPTS = path.join(import.meta.dirname, '..', '..', '..', 'skills', 'build', 'scripts');
const IDENTITY = ['-c', 'user.name=exo-bench', '-c', 'user.email=bench@exo.invalid'];

const git = (repo, args) => execFileSync('git', ['-C', repo, ...IDENTITY, ...args], { encoding: 'utf8' }).trim();
const plainEnvironment = () => Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('NODE_TEST')));
const script = (name, args) => execFileSync(process.execPath, [path.join(SKILL_SCRIPTS, name), ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: plainEnvironment() });

export const planPathOf = (repo, planId) => path.join(fs.realpathSync(repo), 'docs', 'specs', `${planId}.md`);

function writePlan(fixture, repo) {
  const planId = path.basename(fixture);
  const text = fs.readFileSync(path.join(fixture, 'plan.md'), 'utf8').replace(/^Repository: .*$/m, `Repository: ${fs.realpathSync(repo)}`);
  const file = planPathOf(repo, planId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return { file, branch: text.match(/^Branch: (.+)$/m)[1].trim() };
}

function landPrepared(fixture, repo, plan, number) {
  applyPrepared({ prepared: path.join(fixture, 'prepared'), checkout: repo, number, attempt: 2 });
  script('land-task.mjs', ['--plan', plan, '--task', String(number), '--root', repo]);
}

export function plantRun(fixture, { landFirst = [] } = {}) {
  const repo = path.resolve(process.argv[2] ?? '');
  if (!process.argv[2] || !fs.existsSync(path.join(repo, '.git'))) {
    console.error('usage: node setup.mjs <repoDir>');
    process.exit(2);
  }
  const { file, branch } = writePlan(fixture, repo);
  git(repo, ['switch', '-q', '-c', branch]);
  script('start-run.mjs', ['--plan', file, '--checkout', repo]);
  fs.appendFileSync(path.join(repo, '.git', 'info', 'exclude'), '/docs/\n');
  for (const number of landFirst) landPrepared(fixture, repo, file, number);
  fs.writeFileSync(path.join(repo, '.exo', 'setup-head'), `${git(repo, ['rev-parse', 'HEAD'])}\n`);
}
