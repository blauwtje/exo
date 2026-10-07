// Reads a plan as `spec` writes it and asks the checkout what landed:
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
// `Task 1, 2`, `Tasks 1 and 2`, or a compact plan's bare `1, 2`. One trailing
// parenthesis is a note, not a task; a parenthesis between numbers fails the
// list rather than hiding one.
const DEPENDS_LIST = /^(?:none|Tasks? \d+(?:(?:,|,? and) (?:Task )?\d+)*|\d+(?:, ?\d+)*)$/;
// A compact field-line segment after `Depends on: `: `Key: value`, split on
// ` | ` from the depends value itself. `Files:`/`Data:`/`Design:`/`Proof:`/`Risk:`
// are the keys the compact grammar defines; an unrecognized key is kept
// unparsed.
const FIELD_SEGMENT = /^([A-Za-z][A-Za-z ]*): (.*)$/;
const BACKTICKED_PATH = /`([^`]+)`/g;
const DEPENDS_NOTE = /\s*\([^()]*\)$/;
const LIST_MARKER = /^(?:[-*]|\d+\.)\s+/;

/** The plan cannot be ordered or read as spec writes it: the caller exits 1. */
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
  const normalizedText = planText.replaceAll('\r\n', '\n');
  for (const line of normalizedText.split('\n')) {
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

// The extra ` | `-separated segments of a compact field line, keyed by name:
// `Files: \`a\`, \`b\` | Data: ...` becomes `{ Files: '...', Data: '...' }`.
// A segment that isn't `Key: value` is dropped rather than failing the parse;
// plan-check, not the parser, judges a compact plan's field line complete.
// A segment that opens with no `Key: ` continues the field before it, so a
// `Proof:` shell pipeline split on its own ` | ` reads back whole.
function fieldSegments(segments) {
  const fields = {};
  let previousKey = null;
  for (const segment of segments) {
    const match = segment.match(FIELD_SEGMENT);
    if (match !== null) {
      previousKey = match[1];
      fields[previousKey] = match[2];
    } else if (previousKey !== null) {
      fields[previousKey] = `${fields[previousKey]} | ${segment}`;
    }
  }
  return fields;
}

function bulletFiles(section) {
  return section.split('\n')
    .map((line) => line.match(FILE_LINE))
    .filter((match) => match !== null)
    .map((match) => ({ kind: match[1], path: match[2], region: match[3] ?? null }));
}

// A compact `Files:` segment names paths only, no Create/Modify/Test kind and
// no region, so `driftOf()` (which only ever acts on a `Modify` kind) is a
// no-op for these; the compact grammar carries no drift check.
function filesFromField(value) {
  return [...value.matchAll(BACKTICKED_PATH)].map((match) => ({ kind: null, path: match[1], region: null }));
}

function describeTask({ number, title, lines }) {
  const section = lines.join('\n').trimEnd();
  const dependsLine = section.match(/^Depends on: (.+)$/m)?.[1] ?? 'none';
  // A compact field line packs `Files:`/`Data:`/`Design:` after the depends
  // value on the same line, separated by ` | `; an old-format line never
  // contains ` | `, so splitting it is a no-op and `segments.length` stays 1.
  const segments = dependsLine.split(' | ');
  const compact = segments.length > 1;
  const dependsList = segments[0].replace(DEPENDS_NOTE, '');
  if (!DEPENDS_LIST.test(dependsList)) {
    throw new PlanError(`Task ${number}: 'Depends on: ${dependsLine}' does not read 'none' or 'Task <m>, Task <k>'`);
  }
  const dependsOn = (dependsList.match(/\d+/g) ?? []).map(Number);
  const fields = fieldSegments(segments.slice(1));
  const files = fields.Files !== undefined ? filesFromField(fields.Files) : bulletFiles(section);
  const commitBlock = section.match(COMMIT_BLOCK)?.[1] ?? null;
  const subject = commitBlock?.match(COMMIT_SUBJECT) ?? null;
  return {
    number,
    title,
    section,
    dependsOn,
    files,
    filesField: fields.Files ?? null,
    compact,
    design: /^Design: /m.test(section) || fields.Design !== undefined,
    proof: fields.Proof ?? null,
    risk: fields.Risk ?? null,
    commitBlock,
    commitSubject: subject === null ? null : subject[2] ?? subject[1].replace(/\\(["\\$`])/g, '$1')
  };
}

function bullets(text) {
  return text.split('\n').filter((line) => line.startsWith('- ')).map((line) => line.slice(2));
}

// The task numbers the Checkpoint's `Parallel:` line names; null when it
// reads `every task`, which restricts nothing, and none when the line is
// absent, since a plan that never stated what may run together runs serially.
function parallelTasks(checkpoint) {
  const line = checkpoint.match(/^- Parallel: (.+)$/m)?.[1] ?? null;
  if (line === null) return [];
  if (/\bevery task\b/i.test(line)) return null;
  return (line.match(/\d+/g) ?? []).map(Number);
}

export function frameOf(frame) {
  const basis = frame['Plan basis'] ?? '';
  return {
    goal: frame.Goal ?? '',
    successCriterion: frame['Success criterion'] ?? null,
    repository: basis.match(/^Repository: (.+)$/m)?.[1] ?? null,
    branch: basis.match(/^Branch: (.+)$/m)?.[1] ?? null,
    worktreeSetup: basis.match(/^Worktree setup: (.+)$/m)?.[1] ?? null,
    landGate: basis.match(/^Land gate: (.+)$/m)?.[1] ?? null,
    lint: basis.match(/^Lint: (.+)$/m)?.[1] ?? null,
    parallel: parallelTasks(frame.Checkpoint ?? ''),
    nonGoals: bullets(frame['Non-goals'] ?? ''),
    context: bullets(frame.Context ?? ''),
    decisions: bullets(frame.Decisions ?? ''),
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

/** The id a `Plan-task: <plan-id>/<n>` trailer names: the plan file's basename without `.md`. */
export function planIdOf(planPath) {
  return path.basename(planPath, '.md');
}

/** The trailer land-task writes, naming the plan so a branch stacking several plans keeps their tasks apart. */
export function planTaskTrailer(planId, number) {
  return `Plan-task: ${planId}/${number}`;
}

// A task has landed when a commit since the default branch carries its
// `Plan-task: <plan-id>/<n>` trailer. A legacy bare `Plan-task: <n>` names no
// plan, so it counts only beside the subject the task expects: its `Commit:`
// block's subject, else its heading title, the subject land-task derives;
// without that guard a branch stacking plans, or the default branch itself,
// lands every plan's Task 1 at once.
function carriesTask(commit, task, planId) {
  const lines = commit.body.split('\n');
  if (lines.includes(planTaskTrailer(planId, task.number))) return true;
  if (!lines.includes(`Plan-task: ${task.number}`)) return false;
  return commit.subject === (task.commitSubject ?? task.title);
}

export function landedTasks(tasks, root, planId) {
  const commits = commitsOf(root);
  return tasks
    .filter((task) => commits.some((commit) => carriesTask(commit, task, planId)))
    .map((task) => task.number);
}

export function readyTasks(tasks, landed) {
  return tasks.filter((task) => !landed.includes(task.number) && task.dependsOn.every((number) => landed.includes(number)));
}

// The wave `build` step 3 allows: the current task plus every further
// ready task without a `Design:` line whose files share no path with a task
// already in the wave, in plan order, up to WAVE_LIMIT tasks, only when the
// plan names a `Worktree setup:` and holds two or more tasks. A task with no
// Files: entries never joins past the current task, because disjointness
// cannot be proven without paths. A `parallel` list, the task numbers the
// Checkpoint's `Parallel:` line names, keeps every task outside it out of the
// wave, the current one included, so an empty list, which an absent line
// yields, builds one task at a time; null, which `every task` yields,
// restricts nothing.
const WAVE_LIMIT = 4;

export function nextWave(tasks, landed, worktreeSetup, parallel = null) {
  const ready = readyTasks(tasks, landed);
  if (ready.length === 0) return [];
  const [current, ...rest] = ready;
  if (worktreeSetup === null || tasks.length < 2 || current.design || current.files.length === 0) return [current];
  const admitted = (task) => parallel === null || parallel.includes(task.number);
  if (!admitted(current)) return [current];
  const wave = [current];
  const claimedPaths = current.files.map((file) => file.path);
  for (const task of rest) {
    if (wave.length >= WAVE_LIMIT) break;
    if (task.design || !admitted(task)) continue;
    const paths = task.files.map((file) => file.path);
    if (paths.length === 0) continue;
    if (paths.some((path) => claimedPaths.includes(path))) continue;
    wave.push(task);
    claimedPaths.push(...paths);
  }
  return wave;
}

// EnterWorktree and a dispatch's `isolation: "worktree"` place the session in
// a checkout directly under `.claude/worktrees/` and confine its writes and
// git to that checkout, out of reach of a wave's task worktrees, so
// next-task and land-task name no wave there.
export function isolatedCheckout(root) {
  return /[\\/]\.claude[\\/]worktrees[\\/][^\\/]+$/.test(fs.realpathSync(root));
}

// The line next-task and land-task print for a wave: the next task, the
// whole wave, or none when every task landed.
export function waveLine(wave) {
  if (wave.length === 0) return 'Next: none, every task landed';
  if (wave.length === 1) return `Next: Task ${wave[0].number}`;
  return `Wave: ${wave.map((task) => `Task ${task.number}`).join(', ')}`;
}

// A plan with more tasks than this builds through run-unit blocks and keeps a
// decision log beside it, since a builder's open choices outlive the report
// each task overwrites.
export const BLOCK_TASK_LIMIT = 8;

// A plan this small, its code pasted and its files disjoint, the lead builds
// itself in the run checkout, task by task, with no delegate and no worktree.
export const INLINE_TASK_LIMIT = 4;

// A task's code is pasted when it is a long-format task, not a compact one,
// with a non-empty step code block per Files: entry and a Commit: block.
function codePasted(task) {
  if (task.compact || task.commitBlock === null) return false;
  const stepBlocks = codeBlocks(task.section).filter((block) => block !== task.commitBlock && block.trim() !== '');
  return stepBlocks.length >= task.files.length;
}

// The first rule a plan breaks for the inline route, or null when it keeps
// every one. A task with no Files: entries breaks it, because disjointness
// cannot be shown without paths, as in nextWave.
function inlineRefusal(tasks) {
  if (tasks.length === 0) return 'no tasks';
  if (tasks.length > INLINE_TASK_LIMIT) return `${tasks.length} tasks`;
  const ownerOf = new Map();
  for (const task of tasks) {
    if (task.design) return `Task ${task.number}: a Design: task`;
    if (task.files.length === 0) return `Task ${task.number}: no Files: entries`;
    if (!codePasted(task)) return `Task ${task.number}: no pasted code`;
    for (const file of task.files) {
      const owner = ownerOf.get(file.path);
      if (owner !== undefined && owner !== task.number) return `Task ${owner} and Task ${task.number} share ${file.path}`;
      ownerOf.set(file.path, task.number);
    }
  }
  return null;
}

/** The build's route from the plan's tasks, never the wave size: `unit`, `inline` or `direct`, with the reason. */
export function planRoute(tasks) {
  if (tasks.length > BLOCK_TASK_LIMIT) return { route: 'unit', reason: `${tasks.length} tasks, over ${BLOCK_TASK_LIMIT}` };
  const refusal = inlineRefusal(tasks);
  if (refusal === null) return { route: 'inline', reason: `${tasks.length} tasks, code pasted, files disjoint` };
  return { route: 'direct', reason: `inline refused: ${refusal}` };
}

// The line next-task and land-task print for the route; the bare
// `Route: <route>` token comes first, so a reader matches it by prefix.
export function routeLine({ route, reason }) {
  return `Route: ${route} (${reason})`;
}

// A task's size for the split threshold: the lines across its step code
// blocks, excluding the Commit: block itself, and the count of its Files:
// entries. plan-check.mjs flags a task that grows past 250 lines or 4 files.
export function taskSize(task) {
  const stepBlocks = codeBlocks(task.section).filter((block) => block !== task.commitBlock);
  const lines = stepBlocks.reduce((total, block) => total + (block === '' ? 0 : block.split('\n').length), 0);
  return { lines, files: task.files.length };
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

// The 1-based line range of a region's one definition: from the line
// `definesRegion` marks to where its block closes, so a brief can point the
// build-task at that range instead of the whole file. A line back at the
// definition's indent closes the block there when it is only closing
// punctuation (`}`, `)`, `]`), else the block already ended on the line
// before it; a file that never dedents closes at its last line.
export function regionRange(content, region) {
  const lines = content.split('\n');
  const startIndex = lines.findIndex((line) => definesRegion(line, region));
  if (startIndex === -1) return null;
  const indent = lines[startIndex].match(/^\s*/)[0].length;
  let end = startIndex;
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const lineIndent = line.match(/^\s*/)[0].length;
    if (lineIndent < indent) break;
    if (lineIndent === indent) {
      if (/^[)}\]]+[;,]?$/.test(line.trim())) end = i;
      break;
    }
    end = i;
  }
  return { start: startIndex + 1, end: end + 1 };
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
