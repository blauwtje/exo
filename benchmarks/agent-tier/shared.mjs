import { spawnSync } from 'node:child_process';
import process from 'node:process';

const CASE_MS = 10_000;
const TEST_MS = 30_000;

export function parsedEvents(stdout) {
  return String(stdout ?? '').split('\n').flatMap((line) => {
    try {
      const event = JSON.parse(line);
      return event && typeof event === 'object' ? [event] : [];
    } catch {
      return [];
    }
  });
}

export function testEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('NODE_TEST')));
}

export function npmTest(repo) {
  const run = spawnSync('npm', ['test', '--silent'], { cwd: repo, env: testEnvironment(), encoding: 'utf8', timeout: TEST_MS });
  if (run.status !== 0) throw new Error(`npm test exited ${run.status}`);
}

export function withDeadline(work) {
  let timer;
  const expired = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`no result in ${CASE_MS} ms`)), CASE_MS); });
  return Promise.race([Promise.resolve().then(work), expired]).finally(() => clearTimeout(timer));
}
