// Shared child-process and fixture plumbing for the skill-script tests.
// `node --test` runs every *.test.mjs file in its own process, so the cleanup
// hook registered here belongs to whichever test file imported it.

import { execFile } from 'node:child_process';
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
    execFile(
      process.execPath,
      [file, ...args],
      { cwd: options.cwd ?? SCRIPTS, env: { ...process.env, ...options.env }, timeout: 120_000 },
      (error, stdout, stderr) => resolve({
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout: String(stdout),
        stderr: String(stderr)
      })
    );
  });
}

/** Write `value` as JSON into a fresh temp directory and return its path. */
export async function jsonFixture(name, value) {
  const directory = await fixture();
  const file = path.join(directory, name);
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}
