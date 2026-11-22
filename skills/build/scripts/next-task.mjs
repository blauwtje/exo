import fs from 'node:fs';
import { parseFlags, isMain, environmentMs } from '#script-flags';
import { resolvePlanPath } from '#checkout';
import { landedTasks, planIdOf, defaultBase } from '#plan-landed';
import { gitText } from '#git';
import { parsePlan } from '#plan-tasks';
import { frameOf } from '#plan-frame';
import { scratchPath } from '#scratch-path';

const USAGE = 'usage: next-task.mjs --plan <plan> [--root <checkout>]';

const STANDING = [['Decisions', 'decisions'], ['Non-goals', 'nonGoals'], ['Assumptions', 'assumptions']];

function standingText(frame) {
  const found = frameOf(frame);
  return STANDING.filter(([, key]) => found[key].length > 0)
    .map(([title, key]) => `${title}:\n${found[key].map((item) => (/^\d+\. /.test(item) ? item : `- ${item}`)).join('\n')}\n`)
    .join('\n');
}

export function reviewEffort(changedLines, base) {
  if (changedLines < base) return 'low';
  if (changedLines < 4 * base) return 'medium';
  return changedLines < 16 * base ? 'high' : 'xhigh';
}

function changedLineCount(root, base) {
  return gitText(root, ['diff', '--numstat', `${base}...HEAD`]).split('\n')
    .filter((line) => line !== '')
    .reduce((sum, line) => sum + line.split('\t').slice(0, 2).reduce((count, cell) => count + (Number(cell) || 0), 0), 0);
}

function reviewEffortLine(root) {
  const base = defaultBase(root);
  if (base === null) return 'Review effort: medium (base unknown)\n';
  const changed = changedLineCount(root, base);
  return `Review effort: ${reviewEffort(changed, environmentMs('EXO_REVIEW_LINES', 150))} (${changed} changed lines)\n`;
}

function reviewFocusLines(planText) {
  const bullets = frameOf(parsePlan(planText).frame).reviewFocus?.split('\n').filter((line) => line.startsWith('- ')) ?? [];
  return bullets.length === 0 ? '' : `Review focus:\n${bullets.join('\n')}\n`;
}

export function nextTaskReport({ planText, planPath, root }) {
  const { tasks, frame } = parsePlan(planText);
  const landed = landedTasks(tasks, root, planIdOf(planPath));
  const next = tasks.find((task) => !landed.includes(task.number) && task.dependsOn.every((number) => landed.includes(number)));
  const landedLine = `Landed: ${landed.length === 0 ? 'none' : landed.join(', ')}\n`;
  if (next === undefined) return `${landedLine}Next: none\n`;
  const standing = standingText(frame);
  const task = `${landedLine}Next: ${next.number} ${next.title}\n\n${next.section.trim()}\n`;
  return standing === '' ? task : `${task}\n${standing}`;
}

if (isMain(import.meta.url)) {
  const flags = parseFlags(process.argv.slice(2), { plan: 'value', root: 'value' }, { usage: USAGE });
  const planPath = resolvePlanPath({ plan: flags.plan, root: flags.root });
  const root = flags.root ?? process.cwd();
  const report = nextTaskReport({ planText: fs.readFileSync(planPath, 'utf8'), planPath, root });
  const [landedLine, nextLine] = report.split('\n');
  if (nextLine === 'Next: none') {
    process.stdout.write(`${report}${reviewEffortLine(root)}${reviewFocusLines(fs.readFileSync(planPath, 'utf8'))}`);
  } else {
    const brief = scratchPath(root, `brief-${nextLine.split(' ')[1]}.md`);
    fs.writeFileSync(brief, report);
    process.stdout.write(`${landedLine}\n${nextLine}\nBrief: ${brief}\n`);
  }
}
