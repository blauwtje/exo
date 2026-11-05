import fs from 'node:fs';
import path from 'node:path';

const SCANNED = ['skills', 'agents', 'hooks', 'harnesses/codex/generated'];
const TEXT_FILE = /\.(?:md|mjs|json)$/;
const FOREGROUND = /\bforeground\b|run_in_background[`"']?\s*(?:[:=]|to|as)?\s*false\b|\bno `?run_in_background\b/i;
const DISPATCH = /\b(?:Agent|agents?|calls?|dispatch\w*|send|sends|sent)\b|exo:[\w-]+/i;
const SHELL = /\bBash\b|\btimeout\b|`node /i;

const SUBAGENT_THREAD_LINES = [
  { file: 'skills/build/scripts/next-task-window.mjs', fragment: 'foreground Agent calls, no run_in_background', reason: 'the printed lines are read by a task-runner thread, whose Agent tool has no run_in_background parameter' },
  { file: 'skills/build/references/rolling-window.md', fragment: 'each foreground call returns after its report', reason: 'the window loop runs in a task-runner thread, where every Agent call blocks' },
  { file: 'skills/build/references/agent-cases.md', fragment: 'Run it in the foreground, because a background run ends the turn early', reason: 'the repair is sent from a task-runner thread, where every Agent call blocks' },
];

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && TEXT_FILE.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function isForegroundDispatch(line) {
  return FOREGROUND.test(line) && DISPATCH.test(line) && !SHELL.test(line);
}

function allowanceFor(relativePath, line) {
  return SUBAGENT_THREAD_LINES.find((entry) => relativePath.endsWith(entry.file) && line.includes(entry.fragment));
}

export function scanForegroundDispatches(repository) {
  const flagged = [];
  const used = new Set();
  for (const directory of SCANNED) {
    for (const file of filesUnder(repository.join(directory))) {
      const relativePath = repository.relative(file);
      repository.lines(file).forEach((line, index) => {
        if (!isForegroundDispatch(line)) return;
        const allowance = allowanceFor(relativePath, line);
        if (allowance) return used.add(allowance);
        flagged.push(`${relativePath}:${index + 1}`);
      });
    }
  }
  const stale = SUBAGENT_THREAD_LINES.filter((entry) => !used.has(entry)).map((entry) => entry.file);
  return { flagged, stale };
}

export function checkForegroundDispatch(report, repository) {
  const { flagged, stale } = scanForegroundDispatches(repository);
  report.assert(
    flagged.length === 0,
    'foreground dispatch',
    'no lead-run text tells an Agent call to run in the foreground',
    `${flagged.join(', ')} tell an Agent call to run in the foreground; the lead dispatches in the background and waits for the completion notification`
  );
  report.assert(
    stale.length === 0,
    'foreground dispatch allow list',
    'every allowed subagent-thread line still exists',
    `${stale.join(', ')} no longer holds its allowed line; drop the entry`
  );
}
