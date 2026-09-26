// Shared child-process and fixture plumbing for the skill-script tests.
// `node --test` runs every *.test.mjs file in its own process, so the cleanup
// hook registered here belongs to whichever test file imported it.

import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after } from 'node:test';
import { fileURLToPath } from 'node:url';

export const SCRIPTS = fileURLToPath(new URL('../skills/design-ui/scripts/', import.meta.url));

export const script = (name) => path.join(SCRIPTS, name);

const temporaryDirectories = [];

export async function fixture() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ui-design-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

after(async () => {
  for (const directory of temporaryDirectories) {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

export function run(file, args, options = {}) {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [file, ...args],
      { cwd: options.cwd ?? SCRIPTS, env: { ...process.env, ...options.env }, timeout: 120_000 },
      (error, stdout, stderr) => resolve({
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout: String(stdout),
        stderr: String(stderr)
      })
    );
    if (options.input !== undefined) {
      // A child that exits before reading its stdin fails this write with EPIPE, and an
      // unhandled stream error aborts the whole test file; the execFile callback above
      // still reports the child's real outcome.
      child.stdin.on('error', () => {});
      child.stdin.end(options.input);
    }
  });
}

/** Write `value` as JSON into a fresh temp directory and return its path. */
export async function jsonFixture(name, value) {
  const directory = await fixture();
  const file = path.join(directory, name);
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

// A fixed identity and no signing, so a commit works on a machine that has
// neither configured.
const GIT_SETTINGS = ['-c', 'user.name=exo-test', '-c', 'user.email=exo-test@example.com', '-c', 'commit.gpgsign=false'];

/** Run git in `directory` and return what it printed, trimmed. */
export function git(directory, ...args) {
  const output = execFileSync('git', ['-C', directory, ...GIT_SETTINGS, ...args], { encoding: 'utf8' });
  return output.trim();
}

/** Write `files`, a map of relative path to content, under `root` and commit them all. */
export async function commitFiles(root, files, subject) {
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', subject);
}

// A real repository on branch main with `files` in its first commit. The root
// goes through realpath: macOS reaches its temp directory through a symlink,
// and git reports the resolved path, which no path built from mkdtemp matches.
export async function gitRepository(files) {
  const root = await fs.realpath(await fixture());
  git(root, 'init', '-q', '-b', 'main');
  await commitFiles(root, files, 'chore: seed the fixture');
  return root;
}

const FENCE = '```';

/** One task in the grammar `draft-plan` writes; `trailer: false` drops the Plan-task trailer, `commit: false` the whole block. */
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

/** One compact task: its heading plus the single `Depends on: ... | Files: ... | Data: ...` field line. */
export function compactTask({ number, title, dependsOn = 'none', files, data = 'a plain object', design = null }) {
  const filesSegment = `Files: ${files.map((filePath) => `\`${filePath}\``).join(', ')}`;
  const designSegment = design === null ? '' : ` | Design: ${design}`;
  return [
    `### Task ${number}: ${title}`,
    `Depends on: ${dependsOn} | ${filesSegment} | Data: ${data}${designSegment}`
  ].join('\n');
}

/** A whole compact plan around `tasks`: the `## Goal`/`## Plan basis`/`## Success criterion`/`## Checkpoint` frame the grammar requires, then `## Tasks`. */
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

/** A whole plan around `tasks`, with a `Worktree setup:` line only when `worktreeSetup` is given. */
export function planFixture({ worktreeSetup = null, tasks }) {
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

// A checkout holding a plan split in two phase files as draft-plan writes it:
// phase 1's Goal lists both phases, phase 2's names phase 1 as `Phases:`.
export async function phasedRepository() {
  const root = await gitRepository({ 'src/app.js': 'export const app = 1;\n' });
  const phase = (goal, tasks) => planFixture({ tasks })
    .replace('The fixture proves the plan reader.', goal)
    .replace('Repository: /tmp/fixture', `Repository: ${root}`);
  const phase1Path = path.join(root, 'docs/plans/phase-1.md');
  const phase2Path = path.join(root, 'docs/plans/phase-2.md');
  await fs.mkdir(path.dirname(phase1Path), { recursive: true });
  await fs.writeFile(phase1Path, phase('Phase 1: docs/plans/phase-1.md\nPhase 2: docs/plans/phase-2.md', [
    taskSection({ number: 1, title: 'Greet', files: ['- Create: `src/greet.js`'], subject: 'feat(app): greet' })
  ]));
  await fs.writeFile(phase2Path, phase('Phases: docs/plans/phase-1.md', [
    taskSection({ number: 1, title: 'Style', files: ['- Create: `src/app.css`'], subject: 'feat(app): style' }),
    taskSection({ number: 2, title: 'Tail', dependsOn: 'Task 1', files: ['- Create: `src/tail.js`'], subject: 'feat(app): tail' })
  ]));
  return { root, phase1Path, phase2Path };
}
