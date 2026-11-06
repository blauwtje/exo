import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { gitLine } from '#git';
import { layers, resolve as resolveSetting } from '#settings-store';

const ENV_NAME = /^\.env/;
const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'];
const SEED_FOLDERS = ['node_modules', '.pytest_cache'];

export function commonDir(from) {
  return gitLine(from, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
}

export function mainCheckout(from) {
  const common = commonDir(from);
  return common === null ? null : path.dirname(common);
}

export function relativeFor(root, target) {
  return path.relative(root, target) || '.';
}

function candidates(plan, root) {
  const bases = [process.cwd(), root, mainCheckout(root ?? process.cwd())];
  return bases.filter((base) => base != null).map((base) => path.resolve(base, plan));
}

export function resolvePlanPath({ plan, root }) {
  if (plan === undefined || path.isAbsolute(plan)) return plan;
  return candidates(plan, root).find((candidate) => fs.existsSync(candidate)) ?? plan;
}

function runGit(root, args) {
  const answer = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return { ok: answer.status === 0, text: answer.stdout.trim(), error: answer.stderr.trim().split('\n')[0] };
}

function copyEnvFiles(root, where) {
  const names = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile() && ENV_NAME.test(entry.name)).map((entry) => entry.name);
  const copied = [];
  for (const name of names) {
    if (!runGit(root, ['check-ignore', '-q', '--', name]).ok || fs.existsSync(path.join(where, name))) continue;
    fs.copyFileSync(path.join(root, name), path.join(where, name));
    copied.push(name);
  }
  return copied;
}

function lockfileHash(dir) {
  const name = LOCKFILES.find((lockfile) => fs.existsSync(path.join(dir, lockfile)));
  if (name === undefined) return null;
  const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name)));
  return `${name}:${digest.digest('hex')}`;
}

export function seedCaches(root, where) {
  const hash = lockfileHash(root);
  if (hash === null || hash !== lockfileHash(where)) return [];
  const seeded = [];
  for (const name of SEED_FOLDERS) {
    const source = path.join(root, name);
    const target = path.join(where, name);
    if (!fs.existsSync(source) || fs.existsSync(target)) continue;
    if (!runGit(root, ['check-ignore', '-q', '--', name]).ok) continue;
    fs.cpSync(source, target, { recursive: true, mode: fs.constants.COPYFILE_FICLONE });
    seeded.push(name);
  }
  return seeded;
}

export function createWorktree(root, where, args, { env = true } = {}) {
  const done = runGit(root, args);
  if (env && done.ok && resolveSetting('env', layers(root)).value === 'copy') copyEnvFiles(root, where);
  if (done.ok) seedCaches(root, where);
  return done;
}
