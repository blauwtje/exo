import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { runBounded } from '../../../lib/bounded-command.mjs';

const { NODE_TEST_CONTEXT: _context, ...cleanEnvironment } = process.env;

const quoted = (value) => `'${value.replaceAll("'", "'\\''")}'`;

export async function failingOnBase({ root, base, files, timeoutMs }) {
  if (files.length === 0) return [];
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-base-'));
  try {
    const deadline = Date.now() + timeoutMs;
    const extract = await runBounded(`git -C ${quoted(root)} archive ${quoted(base)} | tar -x -C ${quoted(folder)}`, timeoutMs);
    if (!extract.ok) return [];
    const modules = path.join(root, 'node_modules');
    if (fs.existsSync(modules)) fs.symlinkSync(modules, path.join(folder, 'node_modules'));
    const present = files.filter((file) => fs.existsSync(path.join(folder, file)));
    return await failedAmong(folder, present, deadline);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

async function failedAmong(folder, files, deadline) {
  const failed = [];
  for (const file of files) {
    const leftMs = deadline - Date.now();
    if (leftMs <= 0) return failed;
    const run = await runBounded(`cd ${quoted(folder)} && node --test ${quoted(file)}`, leftMs, cleanEnvironment);
    if (run.timedOutMs !== undefined) return failed;
    if (!run.ok) failed.push(file);
  }
  return failed;
}

export async function preexistingFailureFiles({ root, base, output, timeoutMs, failedFiles }) {
  const files = failedFiles(output);
  if (files.length === 0) return [];
  const onBase = await failingOnBase({ root, base, files, timeoutMs });
  return onBase.length === files.length ? files : [];
}
