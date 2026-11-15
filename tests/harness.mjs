
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after } from 'node:test';
import { fileURLToPath } from 'node:url';

export const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));

const temporaryDirectories = [];

export function restoreEnv(saved) {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

export function tempDir(prefix = 'exo-test-') {
  const directory = mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

after(async () => {
  for (const directory of temporaryDirectories) {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

const SETTINGS_VARIABLE = /^(CLAUDE_PROJECT_DIR|CLAUDE_PLUGIN_OPTION_.*)$/;
const RUN_PIN_VARIABLE = 'EXO_RUN_TASK';
const RUN_SESSION_VARIABLE = 'EXO_RUN_SESSION';
const SESSION_VARIABLE = 'CLAUDECODE';
export const GIT_IDENTITY = { GIT_AUTHOR_NAME: 'stub', GIT_AUTHOR_EMAIL: 'stub@example.com', GIT_COMMITTER_NAME: 'stub', GIT_COMMITTER_EMAIL: 'stub@example.com' };

let emptyConfigDirectory;

function emptyConfig() {
  emptyConfigDirectory ??= tempDir('ui-design-test-');
  return emptyConfigDirectory;
}

async function isolatedEnv(overrides) {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !SETTINGS_VARIABLE.test(name) && name !== RUN_PIN_VARIABLE && name !== RUN_SESSION_VARIABLE && name !== SESSION_VARIABLE)
  );
  return { ...inherited, ...GIT_IDENTITY, CLAUDE_CONFIG_DIR: await emptyConfig(), ...overrides };
}

export async function run(file, args, options = {}) {
  const env = await isolatedEnv(options.env);
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [file, ...args],
      { cwd: options.cwd ?? REPOSITORY_ROOT, env, timeout: 120_000 },
      (error, stdout, stderr) => resolve({
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout: String(stdout),
        stderr: String(stderr)
      })
    );
    if (options.input !== undefined) {
      child.stdin.on('error', () => {});
      child.stdin.end(options.input);
    }
  });
}

const GIT_SETTINGS = ['-c', 'user.name=exo-test', '-c', 'user.email=exo-test@example.com', '-c', 'commit.gpgsign=false'];

export function git(directory, ...args) {
  const output = execFileSync('git', ['-C', directory, ...GIT_SETTINGS, ...args], { encoding: 'utf8' });
  return output.trim();
}

export async function commitFiles(root, files, subject) {
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', subject);
}

export async function gitRepository(files) {
  const root = await fs.realpath(tempDir('ui-design-test-'));
  git(root, 'init', '-q', '-b', 'main');
  await commitFiles(root, files, 'chore: seed the fixture');
  return root;
}

export function compactTask({ number, title, dependsOn = 'none', files, data = 'a plain object', proof = 'node --test' }) {
  const filesSegment = `Files: ${files.map((filePath) => `\`${filePath}\``).join(', ')}`;
  const proofSegment = proof === null ? '' : ` | Proof: ${proof}`;
  return [
    `### Task ${number}: ${title}`,
    `Depends on: ${dependsOn} | ${filesSegment} | Data: ${data}${proofSegment}`
  ].join('\n');
}

export function compactPlanFixture({ tasks }) {
  return [
    '# Plan: compact fixture',
    '',
    '## Goal',
    'The fixture proves the compact plan reader.',
    '',
    '## Plan basis',
    'Repository: /tmp/fixture',
    'Branch: feat/fixture',
    '',
    '## Success criterion',
    '`node --test` passes.',
    '',
    '## Tasks',
    '',
    ...tasks,
    ''
  ].join('\n');
}
