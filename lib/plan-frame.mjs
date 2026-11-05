import { parsePlan } from './plan-tasks.mjs';

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
