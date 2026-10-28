import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SCRATCH_FOLDER } from './scratch-path.mjs';

const TASK_HEADING = /^### Task (\d+): (.*)$/;
const TASK_HEADING_START = /^### Task \d/;
const SECTION_HEADING = /^## (.+)$/;
const FILE_LINE = /^- (Create|Modify|Test): `([^`]+)`(?: \(`([^`]+)`\))?/;
export const COMMIT_BLOCK = /^Commit:\n```bash\n([\s\S]*?)\n```/m;
const COMMIT_SUBJECT = /git commit -m (?:"((?:[^"\\]|\\.)+)"|'([^']+)')/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const DECLARATION_KEYWORDS = new RegExp('^(?:(?:' + [
  'export', 'default', 'async', 'function', 'const', 'let', 'var', 'class', 'interface', 'type', 'enum',
  'struct', 'impl', 'trait', 'def', 'fn', 'func(?:\\s*\\([^)]*\\))?', 'pub(?:\\([^)]*\\))?',
  'static', 'public', 'private', 'protected', 'readonly', 'override', 'get', 'set'
].join('|') + ')\\s+)+');
const DEPENDS_LIST = /^(?:none|Tasks? \d+(?:(?:,|,? and) (?:Task )?\d+)*|\d+(?:, ?\d+)*)$/;
const FIELD_SEGMENT = /^([A-Za-z][A-Za-z ]*): (.*)$/;
const BACKTICKED_PATH = /`([^`]+)`/g;
const LINE_SUFFIX = /:\d+(?:-\d+)?$/;
const DEPENDS_NOTE = /\s*\([^()]*\)$/;
const LIST_MARKER = /^(?:[-*]|\d+\.)\s+/;

export class PlanError extends Error {
  name = 'PlanError';
}

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
  const frame = frameSections(frameLines.join('\n'));
  const criterion = frame['Success criterion'] ?? '';
  const repeat = criterion.match(/^Repeat: (\S*)(.*)$/m);
  return {
    frame,
    tasks: described,
    successRed: redOf(criterion.match(/^Red: (.*)$/m)?.[1]),
    successRepeat: repeat === null ? null : { count: /^\d+$/.test(repeat[1]) ? Number(repeat[1]) : NaN, reason: reasonOf(repeat[2]) }
  };
}

function reasonOf(value) {
  return value.match(/\((.*)\)\s*$/)?.[1].trim() ?? '';
}

function redOf(value) {
  return value === undefined ? null : { reason: reasonOf(value) };
}

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

function filesFromField(value) {
  return [...value.matchAll(BACKTICKED_PATH)].map((match) => ({ kind: null, path: match[1], region: null }));
}

const RUN_LINE = /^Run: (?:`([^`]+)`|(.+))/;
const EXPECTED_LINE = /^Expected: (.*)$/;
const ZERO_FAILURES = /\b0 fail\w*|\bfail\w*:? 0\b/gi;
const EXPECTED_FAILURE = /\b(?:fail\w*|red|non-?zero)\b|\bexit(?:s|\s+code|\s+status)?:?\s*[1-9]/i;

function runsOf(section) {
  const runs = [];
  let fence = 0;
  for (const line of section.split('\n')) {
    fence = fenceAfter(line, fence);
    if (fence !== 0) continue;
    const run = line.match(RUN_LINE);
    if (run !== null) runs.push({ command: (run[1] ?? run[2]).trim(), expected: null });
    const expected = line.match(EXPECTED_LINE)?.[1];
    if (expected !== undefined) for (const pending of runs.filter((entry) => entry.expected === null)) pending.expected = expected;
  }
  return runs.map(({ command, expected }) => ({ command, expectsPass: expected === null || !EXPECTED_FAILURE.test(expected.replace(ZERO_FAILURES, '')) }));
}

const BOUNDARY_VALUE = /^in (.+?) \| out (.+?) \| test (.+)$/;

function boundaryOf(section, fields) {
  const value = fields.Boundary ?? section.match(/^Boundary: (.+)$/m)?.[1];
  const match = value?.trim().match(BOUNDARY_VALUE);
  if (match === null || match === undefined) return null;
  return { in: match[1], out: match[2], test: match[3] };
}

function describeTask({ number, title, lines }) {
  const section = lines.join('\n').trimEnd();
  const dependsLine = section.match(/^Depends on: (.+)$/m)?.[1] ?? 'none';
  const segments = dependsLine.split(' | ');
  const compact = segments.length > 1;
  const dependsList = segments[0].replace(DEPENDS_NOTE, '');
  if (!DEPENDS_LIST.test(dependsList)) {
    throw new PlanError(`Task ${number}: 'Depends on: ${dependsLine}' does not read 'none' or 'Task <m>, Task <k>'`);
  }
  const dependsOn = (dependsList.match(/\d+/g) ?? []).map(Number);
  const fields = fieldSegments(segments.slice(1));
  const files = (fields.Files !== undefined ? filesFromField(fields.Files) : bulletFiles(section))
    .map((file) => ({ ...file, path: file.path.replace(LINE_SUFFIX, '') }));
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
    runs: compact ? [] : runsOf(section),
    risk: fields.Risk ?? null,
    red: redOf(fields.Red),
    data: fields.Data ?? null,
    boundary: boundaryOf(section, fields),
    evidence: fields.Evidence ?? null,
    literals: redOf(fields.Literals),
    commitBlock,
    commitSubject: subject === null ? null : subject[2] ?? subject[1].replace(/\\(["\\$`])/g, '$1')
  };
}

export function openPoints(planText) {
  const section = parsePlan(planText).frame['Open points'] ?? '';
  return section.split('\n').flatMap((line) => line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/)?.[1].trim() ?? []);
}

function bullets(text) {
  return text.split('\n').flatMap((line) => {
    if (line.startsWith('- ')) return line.slice(2);
    return /^\d+\. /.test(line) ? line : [];
  });
}

const PARALLEL_NONE = /^none\.?$/i;
const PARALLEL_EVERY = /^every task\.?$/i;
const PARALLEL_LIST = /^(?:tasks? )?\d+(?:(?:, |,? and )\d+)*\.?$/i;

export function parallelValueValid(value) {
  return [PARALLEL_NONE, PARALLEL_EVERY, PARALLEL_LIST].some((form) => form.test(value.trim()));
}

function parallelLineOf(checkpoint) {
  return checkpoint.match(/^- Parallel: (.+)$/m)?.[1].trim() ?? null;
}

function parallelTasks(checkpoint) {
  const line = parallelLineOf(checkpoint);
  if (line === null || PARALLEL_EVERY.test(line)) return null;
  if (!PARALLEL_LIST.test(line)) return [];
  return line.match(/\d+/g).map(Number);
}

function allowOf(basis) {
  const line = basis.match(/^Allow: (.+)$/m)?.[1] ?? null;
  if (line === null) return null;
  return [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());
}

function appOf(basis) {
  const line = basis.match(/^App: (.+)$/m)?.[1].trim() ?? 'none';
  if (line === 'none') return null;
  const at = line.indexOf(' | Ready: ');
  if (at === -1) return { start: line, ready: null };
  return { start: line.slice(0, at).trim(), ready: line.slice(at + ' | Ready: '.length).trim() };
}

export function frameOf(frame) {
  const basis = frame['Plan basis'] ?? '';
  return {
    goal: frame.Goal ?? '',
    successCriterion: frame['Success criterion'] ?? null,
    repository: basis.match(/^Repository: (.+)$/m)?.[1] ?? null,
    branch: basis.match(/^Branch: (.+)$/m)?.[1] ?? null,
    land: basis.match(/^Land: (local|pr|push-main)$/m)?.[1] ?? null,
    commit: basis.match(/^Commit: (.+)$/m)?.[1].trim() ?? null,
    worktreeSetup: basis.match(/^Worktree setup: (.+)$/m)?.[1] ?? null,
    landGate: basis.match(/^Land gate: (.+)$/m)?.[1] ?? null,
    lint: basis.match(/^Lint: (.+)$/m)?.[1] ?? null,
    allow: allowOf(basis),
    app: appOf(basis),
    parallel: parallelTasks(frame.Checkpoint ?? ''),
    parallelLine: parallelLineOf(frame.Checkpoint ?? ''),
    nonGoals: bullets(frame['Non-goals'] ?? ''),
    context: bullets(frame.Context ?? ''),
    decisions: bullets(frame.Decisions ?? ''),
    assumptions: bullets(frame.Assumptions ?? ''),
    visualDirection: frame['Visual direction'] ?? null
  };
}

export function criterionCommand(successCriterion) {
  return successCriterion?.match(/`([^`]+)`/)?.[1] ?? null;
}

function gitLine(root, args) {
  const answer = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  return answer.status === 0 ? answer.stdout.trim() : null;
}

function defaultRef(root) {
  const remote = gitLine(root, ['symbolic-ref', '-q', '--short', 'refs/remotes/origin/HEAD']);
  if (remote !== null) return { name: remote.replace(/^origin\//, ''), ref: 'refs/remotes/origin/HEAD' };
  const local = ['main', 'master'].find((name) => gitLine(root, ['rev-parse', '-q', '--verify', `refs/heads/${name}`]) !== null);
  return local === undefined ? null : { name: local, ref: `refs/heads/${local}` };
}

export function defaultBranch(root) {
  return defaultRef(root)?.name ?? null;
}

export function defaultBase(root) {
  const base = defaultRef(root);
  const current = gitLine(root, ['symbolic-ref', '-q', '--short', 'HEAD']);
  return base === null || base.name === current ? null : base.ref;
}

export function commitsOf(root) {
  const base = defaultBase(root);
  let log;
  try {
    const range = base === null ? [] : [`${base}..HEAD`];
    log = execFileSync('git', ['-C', root, 'log', '--grep=^Plan-task: ', '--format=%x1e%H%x1f%s%x1f%B', ...range], {
      encoding: 'utf8',
      // why: execFileSync caps output at 1 MiB, which a long history's messages pass and fail with ENOBUFS.
      maxBuffer: Infinity,
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch (error) {
    if (/does not have any commits yet/.test(error.stderr ?? '')) return [];
    throw error;
  }
  return log.split('\x1e').filter((entry) => entry !== '').map((entry) => {
    const [sha, subject, body] = entry.split('\x1f');
    return { sha, subject, body: body ?? '' };
  });
}

export function planIdOf(planPath) {
  return path.basename(planPath, '.md');
}

export function decisionsPathOf(planPath) {
  const { dir, name } = path.parse(planPath);
  return path.join(dir, `${name}-decisions.md`);
}

export function isCovered(entries, file) {
  return entries.some((entry) => entry === file || (entry.endsWith('/') && file.startsWith(entry)));
}

function isCompanionOf(listed, file) {
  const listedName = path.posix.basename(listed);
  const name = path.posix.basename(file);
  const stemEnd = listedName.indexOf('.');
  if (listed.endsWith('/') || stemEnd <= 0 || name === listedName) return false;
  if (path.posix.dirname(listed) !== path.posix.dirname(file)) return false;
  return name.length > stemEnd + 1 && name.startsWith(listedName.slice(0, stemEnd + 1));
}

export function coversCompanion(entries, file) {
  return entries.some((entry) => isCompanionOf(entry, file));
}

export function isPlanDoc(file) {
  return file === 'CHANGELOG.md' || (file.startsWith('docs/') && file.endsWith('.md'));
}

export function proofRecordPath(root, planId, number) {
  return path.join(root, SCRATCH_FOLDER, `proof-${planId}-task-${number}.txt`);
}

export function planTaskTrailer(planId, number) {
  return `Plan-task: ${planId}/${number}`;
}

function carriesTask(commit, task, planId) {
  const lines = commit.body.split('\n');
  const named = lines.includes(planTaskTrailer(planId, task.number)) || lines.includes(`Plan-task: ${task.number}`);
  return named && commit.subject === (task.commitSubject ?? task.title);
}

function commitsFrom(rootOrCommits) {
  return Array.isArray(rootOrCommits) ? rootOrCommits : commitsOf(rootOrCommits);
}

export function landedTasks(tasks, rootOrCommits, planId) {
  const commits = commitsFrom(rootOrCommits);
  return tasks
    .filter((task) => commits.some((commit) => carriesTask(commit, task, planId)))
    .map((task) => task.number);
}

export function taskCommits(task, rootOrCommits, planId) {
  return commitsFrom(rootOrCommits).filter((commit) => carriesTask(commit, task, planId)).map((commit) => commit.sha);
}

export function readyTasks(tasks, landed) {
  return tasks.filter((task) => !landed.includes(task.number) && task.dependsOn.every((number) => landed.includes(number)));
}

const WAVE_LIMIT = 4;

export function nextWave(tasks, landed, worktreeSetup, parallel = null, inFlight = []) {
  if (inFlight.length > 0) return startable(tasks, landed, worktreeSetup, parallel, inFlight);
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

function startable(tasks, landed, worktreeSetup, parallel, inFlight) {
  const running = tasks.filter((task) => inFlight.includes(task.number));
  if (worktreeSetup === null || tasks.length < 2 || running.some((task) => task.files.length === 0)) return [];
  const claimedPaths = running.flatMap((task) => task.files.map((file) => file.path));
  const started = [];
  for (const task of readyTasks(tasks, landed)) {
    if (running.length + started.length >= WAVE_LIMIT) break;
    if (inFlight.includes(task.number) || task.design) continue;
    if (parallel !== null && !parallel.includes(task.number)) continue;
    const paths = task.files.map((file) => file.path);
    if (paths.length === 0 || paths.some((path) => claimedPaths.includes(path))) continue;
    started.push(task);
    claimedPaths.push(...paths);
  }
  return started;
}

export function isolatedCheckout(root) {
  return /[\\/]\.claude[\\/]worktrees[\\/][^\\/]+$/.test(fs.realpathSync(root));
}

export function waveLine(wave, inFlight = []) {
  if (inFlight.length > 0) {
    return `Start: ${wave.length === 0 ? 'none' : wave.map((task) => `Task ${task.number}`).join(', ')}`;
  }
  if (wave.length === 0) return 'Next: none, every task landed';
  if (wave.length === 1) return `Next: Task ${wave[0].number}`;
  return `Wave: ${wave.map((task) => `Task ${task.number}`).join(', ')}`;
}

export const BLOCK_TASK_LIMIT = 8;

export const INLINE_TASK_LIMIT = 4;

function codePasted(task) {
  if (task.compact || task.commitBlock === null) return false;
  const stepBlocks = codeBlocks(task.section).filter((block) => block !== task.commitBlock && block.trim() !== '');
  return stepBlocks.length >= task.files.length;
}

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

export function planRoute(tasks) {
  if (inlineRefusal(tasks) === null) return { route: 'inline', reason: `${tasks.length} tasks, code pasted, files disjoint` };
  return { route: 'unit', reason: `${tasks.length} tasks` };
}

export function nextBlock(tasks, landed) {
  const [current] = readyTasks(tasks, landed);
  if (current === undefined) return [];
  if (current.design) return [current];
  const block = [];
  for (const task of tasks.slice(tasks.indexOf(current))) {
    if (landed.includes(task.number)) continue;
    if (block.length >= BLOCK_TASK_LIMIT || task.design) break;
    const blockNumbers = block.map((entry) => entry.number);
    if (!task.dependsOn.every((number) => landed.includes(number) || blockNumbers.includes(number))) break;
    block.push(task);
  }
  return block;
}

export function routeLine({ route, reason }) {
  return `Route: ${route} (${reason})`;
}

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

const INPUT_PATH = /`(\/[^`\s/]+\/[^`\s]*)`/g;

const PATTERN_TOKEN = /[{<*]|\/:/;

function realpathOrSelf(file) {
  try {
    return fs.realpathSync(file);
  } catch {
    return file;
  }
}

function localRoots() {
  const roots = [os.tmpdir(), '/tmp', os.homedir()];
  return [...new Set([...roots, ...roots.map(realpathOrSelf)])];
}

function underLocalRoot(token) {
  return localRoots().some((root) => token.startsWith(root.endsWith('/') ? root : `${root}/`));
}

function isFilePath(token) {
  if (PATTERN_TOKEN.test(token)) return false;
  return reachable(token) || underLocalRoot(token);
}

export function inputPaths(text) {
  return [...text.matchAll(INPUT_PATH)].map((match) => match[1]).filter(isFilePath);
}

const RELATIVE_PATH = /`([^`\s/][^`\s]*\/[^`\s]*)`/g;

// why: a gitignored input is absent from a fresh slot checkout; openSlots copies the ones git ignores.
export function relativeInputPaths(frame) {
  const texts = [...frame.assumptions, ...frame.context];
  return [...new Set(texts.flatMap((text) => [...text.matchAll(RELATIVE_PATH)].map((match) => match[1])))].filter((file) => !file.split('/').includes('..'));
}

function reachable(file) {
  try {
    fs.accessSync(file, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

// why: a builder in a wave slot sees only the brief; an input outside the checkout it cannot read gets written from memory.
function inputDrift(frame) {
  const inputs = new Set([...frame.assumptions, ...frame.context].flatMap(inputPaths));
  return [...inputs].filter((file) => !reachable(file)).map((file) => `input \`${file}\` is unreachable`);
}

export function isInputDrift(item) {
  return /^input `.*` is unreachable$/.test(item);
}

// why: a stop reason or report carries the drift item or the builder's BLOCKED phrase; headless repair skips both.
export const INPUT_UNREADABLE = 'input unreadable';
export function isUnreachableInput(text) {
  return /input `[^`]*` is unreachable/.test(text) || text.includes(INPUT_UNREADABLE);
}

export function driftOf(task, root, frame = null) {
  const drift = frame === null ? [] : inputDrift(frame);
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

function commandParts(command) {
  const parts = [];
  let part = '';
  let quote = null;
  for (let index = 0; index < command.length; index++) {
    const char = command[index];
    if (quote !== null) {
      if (char === '\\' && quote === '"') part += char + (command[++index] ?? '');
      else {
        part += char;
        if (char === quote) quote = null;
      }
    } else if (char === '"' || char === "'") {
      quote = char;
      part += char;
    } else if (char === '\\') {
      part += char + (command[++index] ?? '');
    } else if (char === ';' || char === '|' || (char === '&' && command[index + 1] === '&')) {
      if (char !== ';' && command[index + 1] === char) index++;
      parts.push(part);
      part = '';
    } else {
      part += char;
    }
  }
  parts.push(part);
  return parts.map((entry) => entry.trim()).filter((entry) => entry !== '');
}

const unticked = (value) => value.trim().replace(/^`([^`]+)`$/, '$1');

export function loopCommands({ frame, tasks }) {
  const basis = frameOf(frame);
  const entries = [];
  const add = (field, task, command) => {
    if (command !== null && command !== '' && command !== 'none') entries.push({ field, task, command, parts: commandParts(command) });
  };
  for (const match of (basis.successCriterion ?? '').matchAll(/`([^`]+)`/g)) add('Success criterion', null, match[1].trim());
  add('Land gate', null, basis.landGate === null ? null : unticked(basis.landGate));
  add('Lint', null, basis.lint === null ? null : unticked(basis.lint));
  for (const command of basis.allow ?? []) add('Allow', null, command);
  for (const task of tasks) {
    add('Proof', task.number, task.proof === null ? null : unticked(task.proof));
    for (const run of task.runs) add('Run', task.number, run.command);
  }
  return entries;
}
