// Reads a plan as `planning` writes it and asks the checkout what landed:
// the frame sections, each task's section, files and dependencies, the landed
// set, the next task or wave and the drift of a task's Modify: regions.
// next-task.mjs and land-task.mjs share it, so both read one grammar.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TASK_HEADING = /^### Task (\d+): (.*)$/;
const SECTION_HEADING = /^## (.+)$/;
const FILE_LINE = /^- (Create|Modify|Test): `([^`]+)`(?: \(`([^`]+)`\))?/;
const COMMIT_BLOCK = /^Commit:\n```bash\n([\s\S]*?)\n```/m;
const COMMIT_SUBJECT = /git commit -m "([^"]+)"/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const DECLARATION_KEYWORDS = /^(?:(?:export|default|async|function|const|let|var|class|def|pub|fn|func|static|public|private)\s+)+/;
const LIST_MARKER = /^(?:[-*]|\d+\.)\s+/;

// A fence closes only on a run of backticks at least as long as the one that
// opened it, so a step that shows a markdown file with fences of its own keeps
// its task boundaries. `open` is 0 outside a fence, else the opening length.
function fenceAfter(line, open) {
  const backticks = line.match(/^(`{3,})/);
  if (backticks === null) return open;
  if (open === 0) return backticks[1].length;
  return backticks[1].length >= open ? 0 : open;
}

export function parsePlan(planText) {
  const frameLines = [];
  const tasks = [];
  let current = null;
  let fence = 0;
  for (const line of planText.split('\n')) {
    fence = fenceAfter(line, fence);
    const taskHeading = fence === 0 ? line.match(TASK_HEADING) : null;
    if (taskHeading !== null) {
      current = { number: Number(taskHeading[1]), title: taskHeading[2], lines: [line] };
      tasks.push(current);
      continue;
    }
    if (fence === 0 && SECTION_HEADING.test(line)) current = null;
    if (current === null) frameLines.push(line);
    else current.lines.push(line);
  }
  return { frame: frameSections(frameLines.join('\n')), tasks: tasks.map(describeTask) };
}

function frameSections(frameText) {
  const sections = {};
  let name = null;
  let fence = 0;
  for (const line of frameText.split('\n')) {
    fence = fenceAfter(line, fence);
    const heading = fence === 0 ? line.match(SECTION_HEADING) : null;
    if (heading !== null) {
      name = heading[1];
      sections[name] = [];
      continue;
    }
    if (name !== null) sections[name].push(line);
  }
  return Object.fromEntries(Object.entries(sections).map(([heading, lines]) => [heading, lines.join('\n').trim()]));
}

function describeTask({ number, title, lines }) {
  const section = lines.join('\n').trimEnd();
  const dependsLine = section.match(/^Depends on: (.+)$/m)?.[1] ?? 'none';
  const dependsOn = [...dependsLine.matchAll(/Task (\d+)/g)].map((match) => Number(match[1]));
  const files = section.split('\n')
    .map((line) => line.match(FILE_LINE))
    .filter((match) => match !== null)
    .map((match) => ({ kind: match[1], path: match[2], region: match[3] ?? null }));
  const commitBlock = section.match(COMMIT_BLOCK)?.[1] ?? null;
  return {
    number,
    title,
    section,
    dependsOn,
    files,
    design: /^Design: /m.test(section),
    commitBlock,
    commitSubject: commitBlock?.match(COMMIT_SUBJECT)?.[1] ?? null
  };
}

function bullets(text) {
  return text.split('\n').filter((line) => line.startsWith('- ')).map((line) => line.slice(2));
}

export function frameOf(frame) {
  const basis = frame['Plan basis'] ?? '';
  return {
    goal: frame.Goal ?? '',
    repository: basis.match(/^Repository: (.+)$/m)?.[1] ?? null,
    branch: basis.match(/^Branch: (.+)$/m)?.[1] ?? null,
    worktreeSetup: basis.match(/^Worktree setup: (.+)$/m)?.[1] ?? null,
    nonGoals: bullets(frame['Non-goals'] ?? ''),
    context: bullets(frame.Context ?? ''),
    visualDirection: frame['Visual direction'] ?? null
  };
}

function commitsOf(root) {
  let log;
  try {
    log = execFileSync('git', ['-C', root, 'log', '--format=%x1e%s%x1f%B'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    if (/does not have any commits yet/.test(error.stderr ?? '')) return [];
    throw error;
  }
  return log.split('\x1e').filter((entry) => entry !== '').map((entry) => {
    const [subject, body] = entry.split('\x1f');
    return { subject, body: body ?? '' };
  });
}

// A task has landed when a commit carries its `Plan-task: <n>` trailer and the
// subject its `Commit:` block gives: the trailer alone is not enough, because a
// branch that merged earlier plans, such as the default branch, holds a
// `Plan-task: 1` for each of them. A task without a `Commit:` block matches on
// the trailer alone.
function carriesTask(commit, task) {
  if (!new RegExp(`^Plan-task: ${task.number}$`, 'm').test(commit.body)) return false;
  return task.commitSubject === null || commit.subject === task.commitSubject;
}

export function landedTasks(tasks, root) {
  const commits = commitsOf(root);
  return tasks
    .filter((task) => commits.some((commit) => carriesTask(commit, task)))
    .map((task) => task.number);
}

export function readyTasks(tasks, landed) {
  return tasks.filter((task) => !landed.includes(task.number) && task.dependsOn.every((number) => landed.includes(number)));
}

// The wave `implementing` step 3 allows: the current task plus the next ready
// task without a `Design:` line, two at most, only when the plan names a
// `Worktree setup:` and holds four or more tasks.
export function nextWave(tasks, landed, worktreeSetup) {
  const ready = readyTasks(tasks, landed);
  if (ready.length === 0) return [];
  const [current, ...rest] = ready;
  if (worktreeSetup === null || tasks.length < 4 || current.design) return [current];
  const partner = rest.find((task) => !task.design);
  return partner === undefined ? [current] : [current, partner];
}

export function codeBlocks(section) {
  const blocks = [];
  let fence = 0;
  let lines = null;
  for (const line of section.split('\n')) {
    const before = fence;
    fence = fenceAfter(line, fence);
    if (before === 0 && fence !== 0) {
      lines = [];
      continue;
    }
    if (before !== 0 && fence === 0) {
      blocks.push(lines.join('\n'));
      lines = null;
      continue;
    }
    if (lines !== null) lines.push(line);
  }
  return blocks;
}

// An identifier region (a function or key) counts only where a declaration
// keyword, a colon or an equals sign marks its definition, never at a call;
// any other region (a heading, a selector, a bold lead) counts where a line
// starts with it after its list marker.
function definesRegion(line, region) {
  const stripped = line.trimStart().replace(LIST_MARKER, '');
  if (!IDENTIFIER.test(region)) return stripped.startsWith(region);
  const escaped = region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`^${escaped}\\s*[:=]`).test(stripped)) return true;
  const declared = stripped.match(DECLARATION_KEYWORDS);
  if (declared === null) return false;
  return new RegExp(`^${escaped}(?![\\w$])`).test(stripped.slice(declared[0].length));
}

function alreadyApplied(section, region, content) {
  return codeBlocks(section).some((block) => block.includes(region) && content.includes(block));
}

export function driftOf(task, root) {
  const drift = [];
  for (const file of task.files.filter((entry) => entry.kind === 'Modify')) {
    const target = path.join(root, file.path);
    if (!fs.existsSync(target)) {
      drift.push(`\`${file.path}\` is missing`);
      continue;
    }
    if (file.region === null) continue;
    const content = fs.readFileSync(target, 'utf8');
    const definitions = content.split('\n').filter((line) => definesRegion(line, file.region)).length;
    if (definitions === 0) drift.push(`region \`${file.region}\` is missing from \`${file.path}\``);
    else if (definitions > 1) drift.push(`region \`${file.region}\` is duplicated in \`${file.path}\``);
    else if (alreadyApplied(task.section, file.region, content)) drift.push(`region \`${file.region}\` is already changed in \`${file.path}\``);
  }
  return drift;
}
