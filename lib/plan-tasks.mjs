import path from 'node:path';

const TASK_HEADING = /^### Task (\d+): (.*)$/;
const TASK_HEADING_START = /^### Task \d/;
const SECTION_HEADING = /^## (.+)$/;
const FILE_LINE = /^- (Create|Modify|Test): `([^`]+)`(?: \(`([^`]+)`\))?/;
export const COMMIT_BLOCK = /^Commit:\n```bash\n([\s\S]*?)\n```/m;
const COMMIT_SUBJECT = /git commit -m (?:"((?:[^"\\]|\\.)+)"|'([^']+)')/;
export const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
export const DECLARATION_KEYWORDS = new RegExp('^(?:(?:' + [
  'export', 'default', 'async', 'function', 'const', 'let', 'var', 'class', 'interface', 'type', 'enum',
  'struct', 'impl', 'trait', 'def', 'fn', 'func(?:\\s*\\([^)]*\\))?', 'pub(?:\\([^)]*\\))?',
  'static', 'public', 'private', 'protected', 'readonly', 'override', 'get', 'set'
].join('|') + ')\\s+)+');
const DEPENDS_LIST = /^(?:none|Tasks? \d+(?:(?:,|,? and) (?:Task )?\d+)*|\d+(?:, ?\d+)*)$/;
const FIELD_SEGMENT = /^([A-Za-z][A-Za-z ]*): (.*)$/;
const BACKTICKED_PATH = /`([^`]+)`/g;
const LINE_SUFFIX = /:\d+(?:-\d+)?$/;
const DEPENDS_NOTE = /\s*\([^()]*\)$/;
export const LIST_MARKER = /^(?:[-*]|\d+\.)\s+/;

export class PlanError extends Error {
  name = 'PlanError';
}

export function fenceAfter(line, open) {
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
    successBaseline: baselineOf(criterion.match(/^Baseline: (.*)$/m)?.[1]),
    benchmarkOverride: criterion.match(/^Benchmark-override: (.*)$/m)?.[1].trim() ?? null,
    successRed: redOf(criterion.match(/^Red: (.*)$/m)?.[1]),
    successRepeat: repeat === null ? null : { count: /^\d+$/.test(repeat[1]) ? Number(repeat[1]) : NaN, reason: reasonOf(repeat[2]) }
  };
}

function reasonOf(value) {
  return value.match(/\((.*)\)\s*$/)?.[1].trim() ?? '';
}

function baselineOf(value) {
  if (value === undefined) return null;
  const parts = value.trim().match(/^(\S+) @ ([0-9a-f]{7,40})$/);
  return parts === null ? { malformed: value.trim() } : { file: parts[1], commit: parts[2] };
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
    pause: fields.Pause ?? null,
    red: redOf(fields.Red),
    data: fields.Data ?? null,
    boundary: boundaryOf(section, fields),
    evidence: fields.Evidence ?? null,
    literals: redOf(fields.Literals),
    commitBlock,
    commitSubject: subject === null ? null : subject[2] ?? subject[1].replace(/\\(["\\$`])/g, '$1')
  };
}
