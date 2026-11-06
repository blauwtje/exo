import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const NAME = 'test git env';
const PRELOAD = 'tests/clean-run-env.mjs';
const PRELOAD_NAME = 'clean-run-env.mjs';
const TEST_RUNNER_FLAG = /(?<![\w-])--test(?![\w-])/;
const GIT_SPAWN = /['"`]git['"`]|\bgit\(|gitRepository\(|\bgit (init|commit|clone)\b/;
const REQUIRED_CONFIG = ['init.defaultbranch=main', 'user.useconfigonly=true'];
const POISON_CONFIG = '[user]\n\tname = poison\n\temail = poison@example.com\n[init]\n\tdefaultBranch = trunk\n';
const PROBE = [
  "import { execFileSync } from 'node:child_process';",
  "const config = execFileSync('git', ['config', '--list', '--show-origin'], { encoding: 'utf8' });",
  'console.log(JSON.stringify({ config, author: process.env.GIT_AUTHOR_NAME ?? null, gitDir: process.env.GIT_DIR ?? null }));'
].join('\n');

function read(repository, relativePath) {
  const file = repository.join(relativePath);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function filesUnder(repository, folder, suffix) {
  const root = repository.join(folder);
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => repository.relative(path.join(entry.parentPath, entry.name)));
}

function manifestScripts(repository) {
  const manifest = read(repository, 'package.json');
  if (manifest === '') return [];
  return Object.entries(JSON.parse(manifest).scripts ?? {}).map(([name, command]) => ({ entry: `package.json script ${name}`, command }));
}

function sourceEntries(repository) {
  const files = ['verify.mjs', ...filesUnder(repository, 'verify', '.mjs'), ...filesUnder(repository, '.github/workflows', '.yml')];
  return files.map((file) => ({ entry: file, command: read(repository, file) }));
}

function unloadedEntries(repository) {
  return [...manifestScripts(repository), ...sourceEntries(repository)]
    .filter(({ command }) => TEST_RUNNER_FLAG.test(command) && !command.includes(PRELOAD_NAME))
    .map(({ entry }) => entry);
}

function gitSpawningTests(repository) {
  return filesUnder(repository, 'tests', '.test.mjs').filter((file) => GIT_SPAWN.test(read(repository, file))).sort();
}

function leaksIn({ config, author, gitDir }) {
  const lines = config.split('\n').filter((line) => line !== '');
  const settings = lines.map((line) => line.split('\t')[1]?.toLowerCase());
  const missing = REQUIRED_CONFIG.filter((setting) => !settings.includes(setting));
  const leaks = [];
  if (lines.some((line) => !line.startsWith('command line:'))) leaks.push('git reads a config file');
  if (missing.length > 0) leaks.push(`git config lacks ${missing.join(', ')}`);
  if (author !== null) leaks.push('GIT_AUTHOR_NAME is inherited');
  if (gitDir !== null) leaks.push('GIT_DIR is inherited');
  return leaks;
}

function probeEnvironment(poison) {
  const env = { ...process.env, HOME: poison, XDG_CONFIG_HOME: poison, GIT_AUTHOR_NAME: 'poison', GIT_DIR: path.join(poison, 'none') };
  for (const name of ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_COUNT', 'EXO_TEST_TMP_ROOT']) delete env[name];
  return env;
}

function probeLeaks(repository) {
  const preload = repository.join(PRELOAD);
  if (!fs.existsSync(preload)) return [`${PRELOAD} is missing`];
  const poison = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-git-env-'));
  try {
    fs.writeFileSync(path.join(poison, '.gitconfig'), POISON_CONFIG);
    const args = ['--import', pathToFileURL(preload).href, '--input-type=module', '-e', PROBE];
    const run = spawnSync(process.execPath, args, { cwd: poison, env: probeEnvironment(poison), encoding: 'utf8', timeout: 30_000 });
    if (run.status !== 0) return [`the probe failed: ${run.stderr.trim().split('\n').pop()}`];
    return leaksIn(JSON.parse(run.stdout));
  } finally {
    fs.rmSync(poison, { recursive: true, force: true });
  }
}

export function checkTestGitEnv(report, repository) {
  const unloaded = unloadedEntries(repository);
  const leaks = probeLeaks(repository);
  if (unloaded.length === 0 && leaks.length === 0) {
    report.result('PASS', NAME, `every test entry point loads ${PRELOAD}, which isolates git from the developer's setup`);
    return;
  }
  const reasons = [
    ...unloaded.map((entry) => `${entry} runs tests without ${PRELOAD}`),
    ...leaks.map((leak) => `${PRELOAD} leaves it open: ${leak}`)
  ];
  report.result('FAIL', NAME, `${reasons.join('; ')}; tests that spawn git inherit the developer's setup: ${gitSpawningTests(repository).join(', ')}`);
}
