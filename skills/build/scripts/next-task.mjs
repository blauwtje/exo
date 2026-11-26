import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandHome } from '#basics';
import { parseFlags, isMain, environmentMs } from '#script-flags';
import { resolvePlanPath } from '#checkout';
import { landedTasks, planIdOf, defaultBase, commitsOf, taskCommits } from '#plan-landed';
import { git, gitLine, gitText, shortSha } from '#git';
import { parsePlan } from '#plan-tasks';
import { frameOf } from '#plan-frame';
import { scratchPath } from '#scratch-path';
import { implementerReportPath } from './land-stopped.mjs';

const USAGE = 'usage: next-task.mjs --plan <plan> [--root <checkout>]';

const STANDING = [['Decisions', 'decisions'], ['Non-goals', 'nonGoals'], ['Facts', 'facts']];

function standingText(frame) {
  const found = frameOf(frame);
  return STANDING.filter(([, key]) => found[key].length > 0)
    .map(([title, key]) => `${title}:\n${found[key].map((item) => (/^\d+\. /.test(item) ? item : `- ${item}`)).join('\n')}\n`)
    .join('\n');
}

export function reviewEffort(changedLines, base) {
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

function routeLine(tasks, landed) {
  const chained = tasks.every((task, index) => index === 0 || (task.dependsOn.length === 1 && task.dependsOn[0] === tasks[index - 1].number));
  if (!chained) return 'Route: builder\n';
  if (tasks.length <= environmentMs('EXO_SELF_BUILD_TASKS', 3)) return 'Route: this session\n';
  const length = Math.min(environmentMs('EXO_CHAIN_TASKS', 4), tasks.length - landed.length);
  return length < 2 ? 'Route: builder\n' : `Route: builder chain ${length}\n`;
}

export function nextTaskReport({ planText, planPath, root }) {
  const { tasks, frame } = parsePlan(planText);
  const landed = landedTasks(tasks, root, planIdOf(planPath));
  const next = tasks.find((task) => !landed.includes(task.number) && task.dependsOn.every((number) => landed.includes(number)));
  const landedLine = `Landed: ${landed.length === 0 ? 'none' : landed.join(', ')}\n`;
  if (next === undefined) return `${landedLine}Next: none\n`;
  const standing = standingText(frame);
  const task = `${landedLine}Next: ${next.number} ${next.title}\n${routeLine(tasks, landed)}\n${next.section.trim()}\n`;
  return standing === '' ? task : `${task}\n${standing}`;
}

function noticedLines({ tasks, commits, root, planId }) {
  const oldest = commits.at(-1);
  const startedAt = oldest === undefined ? 0 : Number(gitLine(root, ['log', '-1', '--format=%ct', `${oldest.sha}^`]) ?? 0);
  return tasks.filter((task) => taskCommits(task, commits, planId).length > 0).flatMap(({ number }) => {
    const report = implementerReportPath(root, number);
    if (!fs.existsSync(report) || Math.floor(fs.statSync(report).mtimeMs / 1000) <= startedAt) return [];
    return fs.readFileSync(report, 'utf8').split('\n')
      .filter((line) => line.startsWith('Noticed:') && line.trim() !== 'Noticed: none')
      .map((line) => `Task ${number}: ${line}`);
  });
}

export function endReportLines({ root, planText, planPath }) {
  const { tasks } = parsePlan(planText);
  const planId = planIdOf(planPath);
  const base = defaultBase(root);
  const stat = base === null ? 'Diff stat: base unknown' : `Diff stat:\n${gitText(root, ['diff', '--stat', `${base}...HEAD`])}`;
  const shas = new Set(tasks.flatMap((task) => taskCommits(task, root, planId)));
  const commits = commitsOf(root).filter((commit) => shas.has(commit.sha));
  const commitLines = commits.map((commit) => `${shortSha(commit.sha)} ${commit.subject}`).reverse();
  const noticed = noticedLines({ tasks, commits, root, planId });
  return `${stat}\nPlan-task commits:\n${commitLines.join('\n')}\n${noticed.length === 0 ? 'Noticed: none' : `Noticed:\n${noticed.join('\n')}`}\n`;
}

const PROMPT_PATH = fileURLToPath(new URL('../references/run-task-prompt.md', import.meta.url));

function dispatchLines({ planPath, root, number, brief, report }) {
  const plan = path.resolve(planPath);
  const checkout = path.resolve(root);
  return [
    `Report: ${report}`,
    'Dispatch:',
    `  Plan: ${plan}`,
    `  Checkout: ${checkout}`,
    `  Task: ${number}`,
    `  Read first: ${brief}`,
    `  Report path: ${report}`,
    `  Prompt: ${PROMPT_PATH}`,
    `  Land with: --plan ${plan} --task ${number} --root ${checkout}`
  ].join('\n');
}

if (isMain(import.meta.url)) {
  const flags = parseFlags(process.argv.slice(2), { plan: 'value', root: 'value' }, { usage: USAGE });
  const planPath = resolvePlanPath({ plan: flags.plan, root: flags.root });
  const root = flags.root ?? process.cwd();
  const planText = fs.readFileSync(planPath, 'utf8');
  const report = nextTaskReport({ planText, planPath, root });
  const [landedLine, nextLine, routeText] = report.split('\n');
  if (nextLine === 'Next: none') {
    process.stdout.write(`${report}${reviewEffortLine(root, planText)}${reviewFocusLines(planText)}${endReportLines({ root, planText, planPath })}`);
  } else {
    const number = Number(nextLine.split(' ')[1]);
    const brief = scratchPath(root, `brief-${number}.md`);
    fs.writeFileSync(brief, report);
    const dispatch = dispatchLines({ planPath, root, number, brief, report: implementerReportPath(root, number) });
    process.stdout.write(`${landedLine}\n${nextLine}\n${routeText}\nBrief: ${brief}\n${dispatch}\n`);
  }
}
