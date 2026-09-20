// Shared child-process and fixture plumbing for the skill-script tests.
// `node --test` runs every *.test.mjs file in its own process, so the cleanup
// hook registered here belongs to whichever test file imported it.

import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after } from 'node:test';
import { fileURLToPath } from 'node:url';

export const SCRIPTS = fileURLToPath(new URL('../skills/designing/scripts/', import.meta.url));

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
