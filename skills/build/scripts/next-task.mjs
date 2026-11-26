import fs from 'node:fs';
import path from 'node:path';
import { expandHome } from '#basics';
import { parseFlags, isMain, environmentMs } from '#script-flags';
import { resolvePlanPath } from '#checkout';
import { landedTasks, planIdOf, defaultBase } from '#plan-landed';
import { git, gitText } from '#git';
import { parsePlan } from '#plan-tasks';
import { frameOf } from '#plan-frame';
import { scratchPath } from '#scratch-path';

const USAGE = 'usage: next-task.mjs --plan <plan> [--root <checkout>]';

const STANDING = [['Decisions', 'decisions'], ['Non-goals', 'nonGoals'], ['Facts', 'facts']];

function standingText(frame) {
  const found = frameOf(frame);
  return STANDING.filter(([, key]) => found[key].length > 0)
    .map(([title, key]) => `${title}:\n${found[key].map((item) => (/^\d+\. /.test(item) ? item : `- ${item}`)).join('\n')}\n`)
    .join('\n');
}

export function reviewEffort(changedLines, base) {
  if (changedLines < base) return 'low';
  if (changedLines < 4 * base) return 'medium';
  return 'high';
}

const newPath = (file) => file.includes('{')
  ? file.replace(/\{([^{}]*) => ([^{}]*)\}/, '$2').replace(/\/\//g, '/').replace(/^\//, '')
  : file.replace(/^.* => /, '');

const sumNumstat = (text, keep = () => true) => text.split('\n')
  .filter((line) => line !== '')
  .map((line) => line.split('\t'))
  .map(([added, removed, file]) => [added, removed, newPath(file)])
  .filter(([, , file]) => keep(file))
  .reduce((sum, cells) => sum + (Number(cells[0]) || 0) + (Number(cells[1]) || 0), 0);

function movedCounts(root, numstat, moves) {
  let changed = sumNumstat(numstat);
  let moved = 0;
  const missing = [];
  for (const { source: written, dest } of moves) {
    const source = expandHome(written);
    const diff = fs.existsSync(source) ? git(root, ['diff', '--no-index', '--numstat', '-M', source, path.join(root, dest)]) : null;
    if (!diff || (diff.status !== 0 && diff.status !== 1) || diff.stderr) {
      missing.push(written);
      continue;
    }
    const prefix = `${dest.replace(/\/$/, '')}/`;
    const added = sumNumstat(numstat, (file) => file === dest || file.startsWith(prefix));
    const real = sumNumstat(diff.stdout);
    changed += real - added;
    moved += added - real;
  }
  return { changed, moved, missing };
}

export function reviewEffortLine(root, planText) {
  const base = defaultBase(root);
  if (base === null) return 'Review effort: medium (base unknown)\n';
  const numstat = gitText(root, ['diff', '--numstat', '-M', `${base}...HEAD`]);
  const moves = frameOf(parsePlan(planText).frame).moves;
  const { changed, moved, missing } = movedCounts(root, numstat, moves);
  const movedText = moves.length === 0 ? '' : `, ${moved} moved${missing.map((source) => `, moved source missing: ${source}`).join('')}`;
  return `Review effort: ${reviewEffort(changed, environmentMs('EXO_REVIEW_LINES', 150))} (${changed} changed lines${movedText})\n`;
}

function reviewFocusLines(planText) {
  const bullets = frameOf(parsePlan(planText).frame).reviewFocus?.split('\n').filter((line) => line.startsWith('- ')) ?? [];
  return bullets.length === 0 ? '' : `Review focus:\n${bullets.join('\n')}\n`;
}

function routeLine(tasks) {
  const chained = tasks.every((task, index) => index === 0 || (task.dependsOn.length === 1 && task.dependsOn[0] === tasks[index - 1].number));
  const small = tasks.length <= environmentMs('EXO_SELF_BUILD_TASKS', 3);
  return `Route: ${chained && small ? 'this session' : 'builder'}\n`;
}

export function nextTaskReport({ planText, planPath, root }) {
  const { tasks, frame } = parsePlan(planText);
  const landed = landedTasks(tasks, root, planIdOf(planPath));
  const next = tasks.find((task) => !landed.includes(task.number) && task.dependsOn.every((number) => landed.includes(number)));
  const landedLine = `Landed: ${landed.length === 0 ? 'none' : landed.join(', ')}\n`;
  if (next === undefined) return `${landedLine}Next: none\n`;
  const standing = standingText(frame);
  const task = `${landedLine}Next: ${next.number} ${next.title}\n${routeLine(tasks)}\n${next.section.trim()}\n`;
  return standing === '' ? task : `${task}\n${standing}`;
}

if (isMain(import.meta.url)) {
  const flags = parseFlags(process.argv.slice(2), { plan: 'value', root: 'value' }, { usage: USAGE });
  const planPath = resolvePlanPath({ plan: flags.plan, root: flags.root });
  const root = flags.root ?? process.cwd();
  const planText = fs.readFileSync(planPath, 'utf8');
  const report = nextTaskReport({ planText, planPath, root });
  const [landedLine, nextLine, routeText] = report.split('\n');
  if (nextLine === 'Next: none') {
    process.stdout.write(`${report}${reviewEffortLine(root, planText)}${reviewFocusLines(planText)}`);
  } else {
    const brief = scratchPath(root, `brief-${nextLine.split(' ')[1]}.md`);
    fs.writeFileSync(brief, report);
    process.stdout.write(`${landedLine}\n${nextLine}\n${routeText}\nBrief: ${brief}\n`);
  }
}
