import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { criterionCommand, frameOf, loopCommands } from '#plan-frame';
import { mcpToolCall } from '#mcp-tool-call';
import { defaultBranch } from '#git';

const REDIRECT = /(?:\d*|&)(>>?)\s*(\S*)/g;
const QUOTED = /"(?:\\.|[^"\\])*"|'[^']*'/g;

function redirectsToFile(part) {
  return [...part.replace(QUOTED, '""').matchAll(REDIRECT)].some((match) => !match[2].startsWith('&') && match[2] !== '/dev/null');
}

export const realPath = (filePath) => (fs.existsSync(filePath) ? fs.realpathSync(filePath) : path.resolve(filePath));
const repoPath = (filePath) => path.normalize(filePath).split(path.sep).join('/').replace(/^\.\//, '');

function checkLoopLandGate(basis, root) {
  if (root === undefined || root === null) return [];
  const packageJsonPath = path.join(root, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return [];
  const scripts = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).scripts ?? {};
  const command = scripts.check !== undefined ? 'npm run check' : scripts.test !== undefined ? 'npm test' : null;
  const gate = basis.landGate?.trim().replace(/^`(.*)`$/, '$1') ?? 'none';
  if (command === null || gate !== 'none') return [];
  return [`loop: 'Land gate: ${gate}' skips the full check; set 'Land gate: ${command}' so each task lands only when it passes, per task only while it stays under a minute`];
}

const CRITERION_TIMEOUT_MS = Number(process.env.EXO_CRITERION_TIMEOUT_MS ?? 120000);

function checkCriterionRuns(command, root) {
  if (command === null || root === undefined || root === null || !fs.existsSync(root) || mcpToolCall(command.trim()) !== null) return [];
  const run = spawnSync(command, { cwd: root, shell: true, stdio: 'ignore', timeout: CRITERION_TIMEOUT_MS });
  if (run.error?.code === 'ETIMEDOUT') return [`loop: the plan's '## Success criterion' '${command}' timed out after ${CRITERION_TIMEOUT_MS} ms`];
  if (run.status === 127) return [`loop: the plan's '## Success criterion' '${command}' exits 127, so its command is not found`];
  return [];
}

const SESSION_BUILD = '; it may stay: build with exo:build, not run-plan';

export function checkLoop(plan, root, planPath) {
  const basis = frameOf(plan.frame);
  const problems = [];
  const planFile = root === undefined || planPath === undefined ? null : repoPath(path.relative(realPath(root), realPath(planPath)));
  const criterion = [...(basis.successCriterion ?? '').matchAll(/`([^`]+)`/g)];
  if (criterion.length !== 1) problems.push("loop: the plan's '## Success criterion' is not one backticked command");
  else if (mcpToolCall(criterion[0][1].trim()) !== null) problems.push(`loop: the plan's '## Success criterion' is an MCP call, which only a session can run${SESSION_BUILD}`);
  for (const task of plan.tasks) {
    const proof = task.proof?.replace(/^`(.*)`$/, '$1') ?? null;
    if (proof !== null && mcpToolCall(proof) !== null) problems.push(`loop: Task ${task.number}: 'Proof: ${proof}' is an MCP call, which only a session can run${SESSION_BUILD}`);
    for (const run of task.runs.filter((entry) => entry.expectsPass && mcpToolCall(entry.command) !== null)) {
      problems.push(`loop: Task ${task.number}: 'Run: ${run.command}' is an MCP call, which only a session can run${SESSION_BUILD}`);
    }
    if (planFile !== null && task.files.some((file) => repoPath(file.path) === planFile)) {
      problems.push(`loop: Task ${task.number}: lists the plan file in Files:, which stops run-plan with 'plan changed'; move that edit to a session after the run`);
    }
  }
  for (const { field, task, parts } of loopCommands(plan)) {
    for (const part of parts.filter(redirectsToFile)) {
      problems.push(`loop: ${field}${task === null ? '' : ` of Task ${task}`}: '${part}' redirects output to a file`);
    }
  }
  const defaultName = root === undefined ? null : defaultBranch(root);
  if (defaultName !== null && basis.branch?.trim() === defaultName) problems.push(`loop: 'Branch: ${basis.branch}' names the default branch`);
  return [...problems, ...checkCriterionRuns(criterionCommand(basis.successCriterion), root), ...checkLoopLandGate(basis, root)];
}

const HTML_ENTITY = /&(?:gt|lt|amp|quot|apos|#\d+|#x[0-9a-f]+);/i;

// why: land runs the raw 'Land gate:' and 'Lint:' text in a shell, so a wrapping backtick pair becomes a command substitution; rejecting here keeps one reading of the field in every consumer.
export function checkRunCommands(plan) {
  const basis = frameOf(plan.frame);
  const problems = [];
  for (const [field, value] of [['Land gate', basis.landGate], ['Lint', basis.lint]]) {
    if (value !== null && /^`[^`]*`$/.test(value.trim())) {
      problems.push(`'${field}: ${value.trim()}' wraps the command in backticks, which the shell runs as a command substitution; write '${field}: ${value.trim().slice(1, -1)}'`);
    }
  }
  for (const { field, task, command } of loopCommands(plan)) {
    const entity = command.match(HTML_ENTITY)?.[0];
    if (entity !== undefined) problems.push(`${field}${task === null ? '' : ` of Task ${task}`}: '${command}' holds the HTML entity '${entity}', which the shell runs as written; write the plain character`);
  }
  return problems;
}

const NESTED_CLAUDE = "exo run's sandbox cannot start a nested claude; move the measurement to the Success line, which gate runs outside the sandbox, with a cost cap in that line";
const CLAUDE_COMMAND = /^(?:npx\s+)?claude(?:\s|$)/;
const CLAUDE_IN_SCRIPT = /confinedClaude\(|\(\s*['"`]claude['"`]/;

function startsClaude(part, root) {
  if (CLAUDE_COMMAND.test(part)) return true;
  const script = part.match(/^node\s+(?:--\S+\s+)*(\S+\.mjs)(?:\s|$)/)?.[1];
  if (script === undefined || root === undefined) return false;
  const file = path.resolve(root, script);
  return fs.existsSync(file) && CLAUDE_IN_SCRIPT.test(fs.readFileSync(file, 'utf8'));
}

export function checkNestedClaude(plan, root) {
  return loopCommands(plan)
    .filter((entry) => entry.field === 'Proof' || entry.field === 'Allow')
    .flatMap((entry) => entry.parts.filter((part) => startsClaude(part, root)).map((part) => ({ entry, part })))
    .map(({ entry, part }) => `${entry.field}${entry.task === null ? '' : ` of Task ${entry.task}`}: '${part}' starts a nested claude: ${NESTED_CLAUDE}`);
}
