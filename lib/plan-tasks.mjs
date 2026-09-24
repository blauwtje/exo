// Reads a plan as `planning` writes it and asks the checkout what landed:
// the frame sections, each task's section, files and dependencies, the landed
// set, the next task or wave and the drift of a task's Modify: regions.
// next-task.mjs, land-task.mjs and plan-check.mjs share it, so all three read
// one grammar. Imported as `#plan-tasks`, because a skill script never
// reaches into another skill's folder.

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TASK_HEADING = /^### Task (\d+): (.*)$/;
const TASK_HEADING_START = /^### Task \d/;
const SECTION_HEADING = /^## (.+)$/;
const FILE_LINE = /^- (Create|Modify|Test): `([^`]+)`(?: \(`([^`]+)`\))?/;
const COMMIT_BLOCK = /^Commit:\n```bash\n([\s\S]*?)\n```/m;
// The first `-m` argument, double-quoted with bash escapes or single-quoted.
const COMMIT_SUBJECT = /git commit -m (?:"((?:[^"\\]|\\.)+)"|'([^']+)')/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
// `func (s *T)` is a Go method's receiver and `pub(crate)` a Rust visibility.
const DECLARATION_KEYWORDS = new RegExp('^(?:(?:' + [
  'export', 'default', 'async', 'function', 'const', 'let', 'var', 'class', 'interface', 'type', 'enum',
  'struct', 'impl', 'trait', 'def', 'fn', 'func(?:\\s*\\([^)]*\\))?', 'pub(?:\\([^)]*\\))?',
  'static', 'public', 'private', 'protected', 'readonly', 'override', 'get', 'set'
].join('|') + ')\\s+)+');
// `none`, or task numbers joined by commas or `and`: `Task 1, Task 2`,
// `Task 1, 2`, `Tasks 1 and 2`. One trailing parenthesis is a note, not a
// task; a parenthesis between numbers fails the list rather than hiding one.
const DEPENDS_LIST = /^(?:none|Tasks? \d+(?:(?:,|,? and) (?:Task )?\d+)*)$/;
const DEPENDS_NOTE = /\s*\([^()]*\)$/;
const LIST_MARKER = /^(?:[-*]|\d+\.)\s+/;

/** The plan cannot be ordered or read as planning writes it: the caller exits 1. */
export class PlanError extends Error {
  name = 'PlanError';
}

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
    if (fence === 0 && taskHeading === null && TASK_HEADING_START.test(line)) {
      throw new PlanError(`'${line}' does not read '### Task <n>: <title>', so its task would join the one above`);
    }
    if (taskHeading !== null) {
      current = { number: Number(taskHeading[1]), title: taskHeading[2], lines: [line] };
      tasks.push(current);
      continue;
    }
    if (fence === 0 && SECTION_HEADING.test(line)) current = null;
    if (current === null) frameLines.push(line);
    else current.lines.push(line);
  }
  const described = tasks.map(describeTask);
  checkOrder(described);
  return { frame: frameSections(frameLines.join('\n')), tasks: described };
}

// Every task number is unique, every dependency names a task of the plan and
// no dependency loops back, so each open task becomes ready at some point and
// an empty next wave means every task landed.
function checkOrder(tasks) {
  const byNumber = new Map();
  for (const task of tasks) {
    if (byNumber.has(task.number)) throw new PlanError(`two tasks are numbered ${task.number}`);
    byNumber.set(task.number, task);
  }
  for (const task of tasks) {
    const unknown = task.dependsOn.find((number) => !byNumber.has(number));
    if (unknown !== undefined) throw new PlanError(`Task ${task.number} depends on Task ${unknown}, which the plan does not hold`);
  }
  const cycle = cycleIn(tasks, byNumber);
  if (cycle !== null) throw new PlanError(`Depends on: forms a cycle: ${cycle.map((number) => `Task ${number}`).join(' -> ')}`);
}

// A depth-first walk: meeting a task still on the path closes a cycle, which
// comes back as the path from that task to itself.
function cycleIn(tasks, byNumber) {
  const done = new Set();
  const path = [];
  function walk(number) {
    if (done.has(number)) return null;
    if (path.includes(number)) return [...path.slice(path.indexOf(number)), number];
    path.push(number);
    for (const dependency of byNumber.get(number).dependsOn) {
      const cycle = walk(dependency);
      if (cycle !== null) return cycle;
    }
    path.pop();
    done.add(number);
    return null;
  }
  for (const task of tasks) {
    const cycle = walk(task.number);
    if (cycle !== null) return cycle;
  }
  return null;
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
  const dependsList = dependsLine.replace(DEPENDS_NOTE, '');
  if (!DEPENDS_LIST.test(dependsList)) {
    throw new PlanError(`Task ${number}: 'Depends on: ${dependsLine}' does not read 'none' or 'Task <m>, Task <k>'`);
  }
  const dependsOn = (dependsList.match(/\d+/g) ?? []).map(Number);
  const files = section.split('\n')
    .map((line) => line.match(FILE_LINE))
    .filter((match) => match !== null)
    .map((match) => ({ kind: match[1], path: match[2], region: match[3] ?? null }));
  const commitBlock = section.match(COMMIT_BLOCK)?.[1] ?? null;
  const subject = commitBlock?.match(COMMIT_SUBJECT) ?? null;
  return {
    number,
    title,
    section,
    dependsOn,
    files,
    design: /^Design: /m.test(section),
    commitBlock,
    commitSubject: subject === null ? null : subject[2] ?? subject[1].replace(/\\(["\\$`])/g, '$1')
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

function gitLine(root, args) {
  const answer = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return answer.status === 0 ? answer.stdout.trim() : null;
}

// The default branch the run left: the one origin/HEAD names, else a local
// main or master. A run committing onto the default branch itself, or a
// checkout with neither, has no base, and its whole history is read.
function defaultBase(root) {
  const current = gitLine(root, ['symbolic-ref', '-q', '--short', 'HEAD']);
  const remote = gitLine(root, ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD']);
  if (remote !== null) return remote === `origin/${current}` ? null : 'refs/remotes/origin/HEAD';
  const local = ['main', 'master'].find((name) => gitLine(root, ['rev-parse', '-q', '--verify', `refs/heads/${name}`]) !== null);
  if (local === undefined || local === current) return null;
  return `refs/heads/${local}`;
}

function commitsOf(root) {
  const base = defaultBase(root);
  let log;
  try {
    // Only commits with a Plan-task line are read, and without the default
    // 1 MiB cap, which a long history's messages pass and fail with ENOBUFS.
    const range = base === null ? [] : [`${base}..HEAD`];
    log = execFileSync('git', ['-C', root, 'log', '--grep=^Plan-task: ', '--format=%x1e%s%x1f%B', ...range], {
      encoding: 'utf8',
      maxBuffer: Infinity,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    if (/does not have any commits yet/.test(error.stderr ?? '')) return [];
    throw error;
  }
  return log.split('\x1e').filter((entry) => entry !== '').map((entry) => {
    const [subject, body] = entry.split('\x1f');
    return { subject, body: body ?? '' };
  });
}

// A task has landed when a commit since the default branch carries its
// `Plan-task: <n>` trailer and the subject its `Commit:` block gives: the
// subject still guards a run on the default branch itself, whose history
// holds a `Plan-task: 1` for every plan merged before. A task without a
// `Commit:` block matches on the trailer alone.
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

// An identifier region (a function, type or key) counts only where a
// declaration keyword, a colon or an equals sign marks its definition, or a
// parameter list is followed by `{` on the same line as a method's is, never
// at a call; any other region (a heading, a selector, a bold lead) counts
// where a line starts with it after its list marker. A method whose
// parameters hold parentheses of their own reads as missing.
function definesRegion(line, region) {
  const stripped = line.trimStart().replace(LIST_MARKER, '');
  if (!IDENTIFIER.test(region)) return stripped.startsWith(region);
  const escaped = region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`^${escaped}\\s*[:=]`).test(stripped)) return true;
  const declared = stripped.match(DECLARATION_KEYWORDS);
  const named = stripped.slice(declared?.[0].length ?? 0);
  if (declared !== null && new RegExp(`^${escaped}(?![\\w$])`).test(named)) return true;
  return new RegExp(`^${escaped}\\s*\\([^()]*\\)\\s*(?::[^{]*)?\\{`).test(named);
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
