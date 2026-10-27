import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { environmentMs, isMain, parseFlags } from './script-flags.mjs';

const DOCKER_READY_MS = 60_000;
const POLL_MS = 2000;
const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const succeeds = (program, args) => spawnSync(program, args, { stdio: 'ignore' }).status === 0;

const NPM_DEPENDENCY_GROUPS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const lineMatcher = (pattern) => (text) => text.split(/\r?\n/).some((line) => pattern.test(line));
const textMatcher = (pattern) => (text) => pattern.test(text);

function npmDeclares(text) {
  try {
    const manifest = JSON.parse(text);
    return NPM_DEPENDENCY_GROUPS.some((group) => Object.keys(manifest?.[group] ?? {}).some((name) => /testcontainers/i.test(name)));
  } catch {
    return false;
  }
}

const pythonDeclares = lineMatcher(/^\s*["']?testcontainers/i);

const MANIFESTS = [
  { matches: (name) => name === 'package.json', declares: npmDeclares },
  { matches: (name) => name.endsWith('.csproj'), declares: textMatcher(/<PackageReference\b[^>]*\bInclude\s*=\s*"[^"]*testcontainers/i) },
  { matches: (name) => name === 'pom.xml', declares: textMatcher(/<(?:artifactId|groupId)>[^<]*testcontainers/i) },
  { matches: (name) => name === 'build.gradle' || name === 'build.gradle.kts', declares: lineMatcher(/^\s*[a-z]\w*[\s(].*testcontainers/i) },
  { matches: (name) => name === 'go.mod', declares: lineMatcher(/^\s*(?:require\s+)?\S*testcontainers\S*\s+v\S+/i) },
  { matches: (name) => name === 'pyproject.toml' || /^requirements.*\.txt$/.test(name), declares: pythonDeclares },
];

function listFiles(root) {
  const run = spawnSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0) return [];
  return run.stdout.split('\0').filter(Boolean);
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function declaresTestcontainers(root, file) {
  const kind = MANIFESTS.find((manifest) => manifest.matches(path.basename(file)));
  if (!kind) return false;
  return kind.declares(readText(path.join(root, file)));
}

function usesTestcontainers(root) {
  return listFiles(root).some((file) => declaresTestcontainers(root, file));
}

export const dockerHost = {
  needed: (root) => COMPOSE_FILES.some((name) => fs.existsSync(path.join(root, name))) || usesTestcontainers(root),
  probe: () => succeeds('docker', ['info']),
  start: () => process.platform === 'darwin' && (succeeds('open', ['-a', 'OrbStack']) || succeeds('open', ['-a', 'Docker'])),
  sleep: sleepSync,
  now: Date.now,
};

function waitForDocker(host, deadlineMs) {
  const until = host.now() + deadlineMs;
  while (host.now() < until) {
    host.sleep(POLL_MS);
    if (host.probe()) return true;
  }
  return false;
}

function ensureDocker(root, host, env) {
  if (!host.needed(root)) return 'up';
  if (host.probe()) return 'up';
  if (!host.start()) return 'docker not running: `docker info` failed and no Docker app could be started, start Docker and rerun';
  const deadlineMs = environmentMs('EXO_DOCKER_READY_MS', DOCKER_READY_MS, env);
  if (waitForDocker(host, deadlineMs)) return 'up';
  return `docker not ready: \`docker info\` did not answer within ${Math.round(deadlineMs / 1000)} s after starting the Docker app, raise EXO_DOCKER_READY_MS or start Docker by hand`;
}

export function ensureServices(root, { docker = dockerHost, env = process.env } = {}) {
  const rows = [() => ensureDocker(root, docker, env)];
  for (const row of rows) {
    const result = row();
    if (result !== 'up') return result;
  }
  return 'up';
}

if (isMain(import.meta.url)) {
  const { root = process.cwd() } = parseFlags(process.argv.slice(2), { root: 'string' });
  const result = ensureServices(path.resolve(root));
  process.stdout.write(`${result}\n`);
  process.exitCode = result === 'up' ? 0 : 1;
}
