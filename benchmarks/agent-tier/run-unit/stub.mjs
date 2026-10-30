import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export function preparedFiles(prepared, number, attempt) {
  const task = path.join(prepared, `task${number}`);
  const bad = path.join(task, 'bad');
  return attempt === 1 && fs.existsSync(bad) ? bad : path.join(task, 'good');
}

function reportText(proof) {
  return `Landed: the prepared change\nTest first: no\nRed: none, prepared change\nProof:\n${proof}: pass\n  ok\nUnresolved: none\n`;
}

function diffOf(checkout) {
  try {
    return execFileSync('git', ['-C', checkout, 'diff'], { encoding: 'utf8' });
  } catch {
    return '';
  }
}

export function applyPrepared({ prepared, checkout, number, attempt }) {
  const proof = fs.readFileSync(path.join(prepared, `task${number}`, 'proof.txt'), 'utf8').trim();
  fs.cpSync(preparedFiles(prepared, number, attempt), checkout, { recursive: true, force: true });
  const scratch = path.join(checkout, '.exo');
  fs.mkdirSync(scratch, { recursive: true });
  const report = path.join(scratch, `implementer-${number}.md`);
  const diff = path.join(scratch, `implementer-${number}.diff`);
  const log = path.join(scratch, `implementer-${number}.log`);
  fs.writeFileSync(report, reportText(proof));
  fs.writeFileSync(diff, diffOf(checkout));
  fs.writeFileSync(log, `${proof}: pass\n`);
  return `Task ${number}: GREEN | diff: ${diff} | log: ${log}`;
}

function isMain() {
  return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
}

function nextAttempt(state, number) {
  fs.mkdirSync(state, { recursive: true });
  const file = path.join(state, `task${number}`);
  const attempt = (fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) : 0) + 1;
  fs.writeFileSync(file, String(attempt));
  return attempt;
}

if (isMain()) {
  const [checkout, number] = process.argv.slice(2);
  const here = import.meta.dirname;
  const attempt = nextAttempt(path.join(here, 'state'), number);
  process.stdout.write(`${applyPrepared({ prepared: path.join(here, 'prepared'), checkout, number, attempt })}\n`);
}
