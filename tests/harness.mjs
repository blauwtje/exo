
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
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

export function readHooks() {
  return JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, 'hooks', 'hooks.json'), 'utf8')).hooks;
}

export function hookEntries() {
  const hooks = readHooks();
  const groups = Object.entries(hooks).flatMap(([event, eventGroups]) => eventGroups.map((group) => ({ event, group })));
  return groups.flatMap(({ event, group }) => group.hooks.map((hook) => ({ event, matcher: group.matcher, hook })));
}

export function readAgents() {
  const agentsRoot = path.join(REPOSITORY_ROOT, 'agents');
  return readdirSync(agentsRoot).filter((fileName) => fileName.endsWith('.md')).map((fileName) => {
    const lines = readFileSync(path.join(agentsRoot, fileName), 'utf8').split('\n');
    const closing = lines.indexOf('---', 1);
    if (lines[0] !== '---' || closing < 1) throw new Error(`${fileName} has no frontmatter block`);
    const frontmatter = {};
    for (const line of lines.slice(1, closing)) {
      const separator = line.indexOf(': ');
      if (separator < 1) throw new Error(`${fileName} has an unreadable frontmatter line: ${line}`);
      frontmatter[line.slice(0, separator)] = line.slice(separator + 2);
    }
    return { fileName, frontmatter, body: lines.slice(closing + 1).join('\n') };
  });
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

export function squashInto(root, branch) {
  git(root, 'merge', '--squash', branch);
  git(root, 'commit', '-q', '-m', `squash ${branch}`);
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

const FENCE = '```';

export function taskSection({ number, title, dependsOn = 'none', design = false, files, subject, trailer = true, commit = true }) {
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
    '',
    FENCE,
    'Run: `node --test`',
    'Expected: `pass`',
    '',
    ...(commit ? ['Commit:', `${FENCE}bash`, 'git add .', commitLine, FENCE] : []),
    ''
  ].join('\n');
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
