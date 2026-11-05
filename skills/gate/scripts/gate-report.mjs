import fs from 'node:fs';
import path from 'node:path';

const TEMPLATE_PATH = path.join(import.meta.dirname, '..', 'assets', 'run-report.md');
const FAILING = /^(?:FAIL|UNPLANNED) /;

const PLAIN_WORDS = {
  PASS: 'works',
  FAIL: 'broken',
  UNPLANNED: 'outside the plan',
  UNRUN: 'not run',
  SKIP: 'skipped',
  WARN: 'look at',
  DONE: 'done',
  OPEN: 'open'
};

export function plainLine(line) {
  const match = /^([A-Z][A-Z-]*)(?= |$)/.exec(line);
  if (match === null) return line;
  const word = PLAIN_WORDS[match[1]] ?? match[1].toLowerCase().replaceAll('-', ' ');
  return word + line.slice(match[1].length);
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

export function answerOf(checkLines, manualCount) {
  const failing = checkLines.filter((line) => FAILING.test(line)).length;
  const verdict = failing === 0 ? 'All checks passed.' : `${plural(failing, 'check', 'checks')} failed. Fix these first.`;
  if (manualCount === 0) return verdict;
  return `${verdict} ${plural(manualCount, 'thing is', 'things are')} left for you to try by hand.`;
}

export function renderRunReport({ answer, proofs, checks, context, manual }, template = fs.readFileSync(TEMPLATE_PATH, 'utf8')) {
  const values = { answer, proofs, checks: checks.map(plainLine).join('\n'), context: context.join('\n'), manual: manual.map((line) => `- ${line}`).join('\n') };
  const filled = template
    .replace(/^<!--.*-->\n?/gm, '')
    .replace(/\{\{(\w+)\}\}/g, (_, name) => values[name] ?? '');
  return `${filled.trimEnd()}\n`;
}
