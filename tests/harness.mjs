
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));

const temporaryDirectories = [];

export function tempDir(prefix = 'exo-test-') {
  const directory = mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

export async function fixture() {
  return tempDir('ui-design-test-');
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
  emptyConfigDirectory ??= fixture();
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

export async function jsonFixture(name, value) {
  const directory = await fixture();
  const file = path.join(directory, name);
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
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
  const root = await fs.realpath(await fixture());
  git(root, 'init', '-q', '-b', 'main');
  await commitFiles(root, files, 'chore: seed the fixture');
  return root;
}

const FENCE = '```';

export function taskSection({ number, title, dependsOn = 'none', design = false, files, code = '', subject, trailer = true, commit = true }) {
  const commitLine = trailer
    ? `git commit -m "${subject}" -m "Plan-task: ${number}"`
    : `git commit -m "${subject}"`;
  return [
    `### Task ${number}: ${title}`,
    '',
    `Depends on: ${dependsOn}`,
    ...(design ? ['Design: design-ui'] : []),
    '',
    'Files:',
    ...files,
    '',
    'Step 1: Write it',
    `${FENCE}js`,
    code,
    FENCE,
    'Run: `node --test`',
    'Expected: `pass`',
    '',
    ...(commit ? ['Commit:', `${FENCE}bash`, 'git add .', commitLine, FENCE] : []),
    ''
  ].join('\n');
}

export function compactTask({ number, title, dependsOn = 'none', files, data = 'a plain object', design = null, proof = 'node --test' }) {
  const filesSegment = `Files: ${files.map((filePath) => `\`${filePath}\``).join(', ')}`;
  const designSegment = design === null ? '' : ` | Design: ${design}`;
  const proofSegment = proof === null ? '' : ` | Proof: ${proof}`;
  return [
    `### Task ${number}: ${title}`,
    `Depends on: ${dependsOn} | ${filesSegment} | Data: ${data}${designSegment}${proofSegment}`
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
    '## Checkpoint',
    '- Blocks first: none.',
    '- Parallel: every task.',
    '- Shared state: none.',
    '- Smallest safe split: one task per file.',
    '',
    '## Tasks',
    '',
    ...tasks,
    ''
  ].join('\n');
}

export function briefFixture({ tasks }) {
  return [
    '# Brief: compact fixture',
    '',
    '## Goal',
    'The fixture proves a brief with a task list checks like a plan.',
    '',
    '## Decisions',
    '- The badge tone comes from the due date alone, decided during the interview.',
    '',
    '## Acceptance',
    '- An overdue task shows a badge in the warning tone.',
    '',
    '## Plan basis',
    'Repository: /tmp/fixture',
    'Branch: feat/fixture',
    '',
    '## Success criterion',
    '`node --test` passes.',
    '',
    '## Checkpoint',
    '- Blocks first: none.',
    '- Parallel: every task.',
    '- Shared state: none.',
    '- Smallest safe split: one task per file.',
    '',
    '## Tasks',
    '',
    ...tasks,
    ''
  ].join('\n');
}

export function planFixture({ worktreeSetup = null, parallel = null, tasks }) {
  return [
    '# Plan: fixture',
    '',
    '## Goal',
    '',
    'The fixture proves the plan reader.',
    '',
    '## Plan basis',
    '',
    'Repository: /tmp/fixture',
    'Branch: feat/fixture',
    ...(worktreeSetup === null ? [] : [`Worktree setup: ${worktreeSetup}`]),
    '',
    '## Non-goals',
    '',
    '- `src/other.js` stays as it is.',
    '',
    '## Context',
    '',
    '- `src/app.js` exports `greet`.',
    '- `src/other.js` is untouched.',
    '',
    ...(parallel === null ? [] : ['## Checkpoint', '', `- Parallel: ${parallel}`, '']),
    '## Visual direction',
    '',
    'Design skill: design-ui',
    '',
    'Quiet record.',
    '',
    '## Tasks',
    '',
    ...tasks,
    '## Final verification',
    '',
    '- `node --test`: `pass`.',
    ''
  ].join('\n');
}
