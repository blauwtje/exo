import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const TALLY_LINE = /^#\s+(tests|pass|fail|skipped)\s+(\d+)\s*$/;

function tallyFrom(lines) {
  const tally = { tests: -1, pass: -1, fail: -1, skipped: -1 };
  for (const line of lines) {
    const match = TALLY_LINE.exec(line);
    if (match) tally[match[1]] = Number(match[2]);
  }
  return tally;
}

function runNode(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', () => resolve({ status: null, output: stdout + stderr }));
    child.on('close', (status) => resolve({ status, output: stdout + stderr }));
  });
}

const NAME = 'skill script behavior';

function outcomeOf(run) {
  const lines = run.output.split('\n');
  const tally = tallyFrom(lines);
  const summary = `${tally.pass} passed, ${tally.fail} failed, ${tally.skipped} skipped of ${tally.tests} behavioral tests`;

  if (run.status !== 0) {
    const failing = lines.filter((line) => line.startsWith('not ok '));
    return { status: 'FAIL', name: NAME, detail: `${summary}; ${failing.join('; ')}` };
  }
  return { status: 'PASS', name: NAME, detail: summary };
}

export function startSkillScriptBehavior(repository) {
  const testsRoot = repository.join('tests');
  if (!(fs.existsSync(testsRoot) && fs.statSync(testsRoot).isDirectory())) {
    return Promise.resolve({ status: 'UNRUN', name: NAME, detail: 'this repository copy has no tests/ folder' });
  }
  const testFiles = fs.readdirSync(testsRoot).sort()
    .filter((name) => name.endsWith('.test.mjs'))
    .map((name) => path.join(testsRoot, name));
  if (testFiles.length === 0) {
    return Promise.resolve({ status: 'UNRUN', name: NAME, detail: 'tests/ holds no *.test.mjs file' });
  }

  const stripFile = repository.join('tests', 'clean-run-env.mjs');
  const strip = ['--import', pathToFileURL(stripFile).href];
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-behavior-'));
  const cleanup = () => fs.rmSync(scratch, { recursive: true, force: true });
  return runNode([...strip, '--test', '--test-reporter=tap', ...testFiles], { ...process.env, TMPDIR: scratch })
    .then((run) => { cleanup(); return outcomeOf(run); });
}
