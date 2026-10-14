import fs from 'node:fs';
import path from 'node:path';
import { parseFlags, UsageError, isMain } from '#script-flags';
import { codeBlocks, defaultBranch, frameOf, isCovered, landedTasks, loopCommands, openPoints, parallelValueValid, parsePlan, planIdOf, PlanError, taskSize } from '#plan-tasks';
import { BYTES_PER_TOKEN, TASK_SPLIT_TOKENS } from '#context-limits';
import { derivedNames } from '#derivation';
import { equalsLandGate } from '#land-gate';
import { mcpToolCall } from '#mcp-tool-call';
import { packageEntryPoints, packageRunTerms } from '#package-entry-point';
import { wholeSuiteKeys } from '#suite-command';

const STEP_HEADING = /^Step \d+: .*$/;
const PLACEHOLDER_ELLIPSIS = /(?<![.\w])\.\.\.(?!\w)/;
const MAX_LINES = 250;
const MAX_FILES = 4;
const RISK_CATEGORIES = ['security boundary', 'persisted format', 'public signature', 'dependency'];
const CHECKPOINT_POINTS = ['Blocks first:', 'Parallel:', 'Shared state:', 'Smallest safe split:'];

// why: Markdown closes a fence only on a run of backticks at least as long as the one that opened it.
function fenceAfter(line, open) {
  const backticks = line.match(/^(`{3,})/);
  if (backticks === null) return open;
  if (open === 0) return backticks[1].length;
  return backticks[1].length >= open ? 0 : open;
}

function stepsOf(section) {
  const steps = [];
  let current = null;
  let fence = 0;
  for (const line of section.split('\n')) {
    fence = fenceAfter(line, fence);
    if (fence === 0 && STEP_HEADING.test(line)) {
      current = { heading: line, lines: [] };
      steps.push(current);
      continue;
    }
    if (current !== null) current.lines.push(line);
  }
  return steps.map((step) => ({ heading: step.heading, text: step.lines.join('\n') }));
}

function checkCommit(task) {
  if (task.commitBlock === null) return [`Task ${task.number}: no Commit: block`];
  if (!new RegExp(`"Plan-task: ${task.number}"`).test(task.commitBlock)) {
    return [`Task ${task.number}: Commit: block carries no "Plan-task: ${task.number}" trailer`];
  }
  return [];
}

function checkGitAdd(task) {
  if (task.commitBlock === null) return [];
  const addLine = task.commitBlock.match(/^git add (.+)$/m);
  if (addLine === null) return [`Task ${task.number}: Commit: block has no 'git add' line`];
  const added = addLine[1].trim().split(/\s+/).sort().join(' ');
  const files = task.files.map((file) => file.path).sort().join(' ');
  if (added !== files) return [`Task ${task.number}: 'git add ${addLine[1]}' does not match Files: (${files})`];
  return [];
}

function checkSteps(task) {
  const problems = [];
  for (const step of stepsOf(task.section)) {
    if (codeBlocks(step.text).length === 0) continue;
    if (!/^Run: /m.test(step.text)) problems.push(`Task ${task.number}: '${step.heading}' has code but no Run:`);
    if (!/^Expected: /m.test(step.text)) problems.push(`Task ${task.number}: '${step.heading}' has code but no Expected:`);
  }
  return problems;
}

function checkPlaceholders(task) {
  const problems = [];
  if (/\btodo\b/i.test(task.section)) problems.push(`Task ${task.number}: a TODO placeholder stands in for code`);
  if (PLACEHOLDER_ELLIPSIS.test(task.section)) problems.push(`Task ${task.number}: an '...' placeholder stands in for code`);
  if (/similar to Task/i.test(task.section)) problems.push(`Task ${task.number}: 'similar to Task' points at another task instead of showing the code`);
  return problems;
}

function checkSize(task) {
  const size = taskSize(task);
  if (size.lines > MAX_LINES || size.files > MAX_FILES) {
    return [`Task ${task.number}: split Task ${task.number} (${size.lines} code lines, ${size.files} files)`];
  }
  return [];
}

function bytesUnder(target) {
  let stat;
  try {
    stat = fs.lstatSync(target);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return stat.size;
  return fs.readdirSync(target).reduce((total, name) => total + bytesUnder(path.join(target, name)), 0);
}

function checkContextSize(task, root) {
  if (root === undefined || root === null) return [];
  const bytes = Buffer.byteLength(task.section) + task.files.reduce((total, file) => total + bytesUnder(path.join(root, file.path)), 0);
  const tokens = Math.ceil(bytes / BYTES_PER_TOKEN);
  if (tokens <= TASK_SPLIT_TOKENS) return [];
  return [`Task ${task.number}: split Task ${task.number} (about ${tokens} tokens of task text and Files:, over ${TASK_SPLIT_TOKENS})`];
}

function checkFilesExist(task, root, byNumber) {
  if (root === undefined || root === null) return [];
  const createdEarlier = new Set(
    [...dependencyChainOf(byNumber, task.number)]
      .flatMap((number) => byNumber.get(number).files)
      .filter((entry) => entry.kind === 'Create')
      .map((entry) => entry.path)
  );
  const problems = [];
  for (const file of task.files.filter((entry) => entry.kind === 'Modify')) {
    if (createdEarlier.has(file.path)) continue;
    if (!fs.existsSync(path.join(root, file.path))) {
      problems.push(`Task ${task.number}: 'Modify: \`${file.path}\`' does not exist in the target repository`);
    }
  }
  return problems;
}

function existingTestsOf(sourcePath, testFiles) {
  const base = path.basename(sourcePath, '.mjs');
  return testFiles
    .filter((name) => name === `${base}.test.mjs` || (name.startsWith(`${base}-`) && name.endsWith('.test.mjs')))
    .map((name) => `tests/${name}`);
}

function checkUnlistedTests(task, root) {
  if (root === undefined || root === null) return [];
  const testsDir = path.join(root, 'tests');
  if (!fs.existsSync(testsDir)) return [];
  const testFiles = fs.readdirSync(testsDir);
  const listed = new Set(task.files.map((file) => file.path));
  const sources = task.files.filter((file) => file.kind !== 'Create' && file.path.endsWith('.mjs') && !file.path.endsWith('.test.mjs'));
  const problems = [];
  for (const source of sources) {
    const tests = existingTestsOf(source.path, testFiles);
    if (tests.length === 0 || tests.some((testPath) => listed.has(testPath))) continue;
    problems.push(`Task ${task.number}: Files: \`${source.path}\` has existing tests ${tests.map((testPath) => `\`${testPath}\``).join(', ')} and lists none of them`);
  }
  return problems;
}

const TEST_FILE_NAME = /^(?:[\w.-]+[._](?:test|spec)|test_[\w.-]+)\.\w+$/;

// why: a test that a task in the Depends on chain lists passes for this task too, and every flag here refuses the run start.
function checkProofTestsListed(task, root, byNumber) {
  if (task.proof === null || root === undefined || root === null) return [];
  const listed = [task.number, ...dependencyChainOf(byNumber, task.number)].flatMap((number) => byNumber.get(number).files.map((file) => file.path));
  const unlisted = (task.proof.match(/[\w./@-]+/g) ?? [])
    .map((token) => token.replace(/^\.\//, ''))
    .filter((token) => TEST_FILE_NAME.test(path.posix.basename(token)) && !isCovered(listed, token) && fs.existsSync(path.join(root, token)));
  return [...new Set(unlisted)].map((testPath) => `Task ${task.number}: add \`${testPath}\` to Files: (its Proof runs it)`);
}

function dependencyChainOf(byNumber, from) {
  const stack = [...byNumber.get(from).dependsOn];
  const seen = new Set();
  while (stack.length > 0) {
    const number = stack.pop();
    if (seen.has(number)) continue;
    seen.add(number);
    stack.push(...byNumber.get(number).dependsOn);
  }
  return seen;
}

function reachesThrough(byNumber, from, to) {
  return dependencyChainOf(byNumber, from).has(to);
}

function checkSharedFiles(tasks) {
  const byNumber = new Map(tasks.map((task) => [task.number, task]));
  const problems = [];
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const first = tasks[i];
      const second = tasks[j];
      const secondPaths = new Set(second.files.map((file) => file.path));
      const shared = new Set(first.files.map((file) => file.path).filter((filePath) => secondPaths.has(filePath)));
      if (shared.size === 0) continue;
      if (reachesThrough(byNumber, first.number, second.number) || reachesThrough(byNumber, second.number, first.number)) continue;
      for (const filePath of shared) {
        problems.push(`Task ${first.number} and Task ${second.number} both list Files: \`${filePath}\` with no Depends on chain between them`);
      }
    }
  }
  return problems;
}

function checkParallelForm(frame) {
  const { parallelLine } = frameOf(frame);
  if (parallelLine === null || parallelValueValid(parallelLine)) return [];
  return [`the plan's '## Checkpoint' line 'Parallel: ${parallelLine}' does not read 'none', 'every task' or task numbers such as 'Tasks 1, 2 and 3'`];
}

function checkParallelDisjoint(tasks, frame) {
  const named = frameOf(frame).parallel ?? [];
  const listed = tasks.filter((task) => named.includes(task.number));
  const byNumber = new Map(tasks.map((task) => [task.number, task]));
  const problems = [];
  for (let i = 0; i < listed.length; i++) {
    for (let j = i + 1; j < listed.length; j++) {
      if (reachesThrough(byNumber, listed[i].number, listed[j].number) || reachesThrough(byNumber, listed[j].number, listed[i].number)) continue;
      const secondPaths = new Set(listed[j].files.map((file) => file.path));
      for (const filePath of new Set(listed[i].files.map((file) => file.path))) {
        if (secondPaths.has(filePath)) problems.push(`Task ${listed[i].number} and Task ${listed[j].number} are both on the Parallel: line but both list Files: \`${filePath}\``);
      }
    }
  }
  return problems;
}

function checkWorktreeSetup(tasks, frame) {
  if (frameOf(frame).worktreeSetup !== null) return [];
  const byNumber = new Map(tasks.map((task) => [task.number, task]));
  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const first = tasks[i].number;
      const second = tasks[j].number;
      if (reachesThrough(byNumber, first, second) || reachesThrough(byNumber, second, first)) continue;
      return [`Task ${first} and Task ${second} share no Depends on chain, but the plan's '## Plan basis' has no 'Worktree setup:' line: add 'Worktree setup: <command>' or 'Worktree setup: none' so they build together`];
    }
  }
  return [];
}

function checkPlanBasis(frame, run) {
  const basis = frame['Plan basis'] ?? '';
  const problems = [];
  if (!/^Repository: .+$/m.test(basis)) problems.push("the plan's '## Plan basis' has no 'Repository:' line");
  if (!/^Branch: .+$/m.test(basis)) problems.push("the plan's '## Plan basis' has no 'Branch:' line");
  const landOptional = run && !/^Land:/m.test(basis);
  if (!landOptional && !/^Land: (local|pr|push-main)$/m.test(basis)) problems.push("the plan's '## Plan basis' has no 'Land:' line, or it is not one of local, pr, push-main");
  if (frameOf(frame).app?.ready === null) problems.push("the plan's '## Plan basis' 'App:' line has no 'Ready:' URL: write 'App: <start command> | Ready: <url>' or 'App: none'");
  return problems;
}

const TASK_CITATION = /\bTasks?\s+\d/;

function checkAcceptanceCitations(frame) {
  const acceptance = frame.Acceptance ?? '';
  const problems = [];
  for (const line of acceptance.split('\n')) {
    const bullet = line.trim();
    if (!bullet.startsWith('- ')) continue;
    const item = bullet.slice(2);
    const anchored = TASK_CITATION.test(item) || item.includes('Data:') || item.includes('Success criterion') || item.includes('Manual checks');
    if (!anchored) {
      problems.push(`the plan's '## Acceptance' item "${item}" names no task number, 'Data:' segment, Success criterion or Manual checks line`);
    }
  }
  return problems;
}

function checkLandGate(frame, root) {
  if (root === undefined || root === null) return [];
  const packageJsonPath = path.join(root, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return [];
  const basis = frame['Plan basis'] ?? '';
  const scripts = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).scripts ?? {};
  const problems = [];
  if (scripts.typecheck !== undefined && !/^Land gate: .+$/m.test(basis)) {
    problems.push("the plan's '## Plan basis' has no 'Land gate:' line, though the target repository's package.json has a typecheck script to gate on: add 'Land gate: npm run typecheck' or 'Land gate: none' to opt out");
  }
  if (scripts.lint !== undefined && !/^Lint: .+$/m.test(basis)) {
    problems.push("the plan's '## Plan basis' has no 'Lint:' line, though the target repository's package.json has a lint script: add a 'Lint:' line naming the linter binary, such as 'Lint: npx eslint', since 'npm run lint' ignores the task's files, or 'Lint: none' to opt out");
  }
  return problems;
}

function checkProductRun(frame, root) {
  if (root === undefined || root === null) return [];
  const terms = packageRunTerms(root);
  const criterion = frame['Success criterion'] ?? '';
  if (terms.length === 0 || criterion.trim() === '') return [];
  const escape = criterion.match(/^Product run: none(?: \((.*)\))?\s*$/m);
  if (escape !== null && (escape[1] ?? '').trim() !== '') return [];
  const entries = packageEntryPoints(root).join(', ');
  if (escape !== null) return [`the plan's 'Product run: none' states no reason: write 'Product run: none (<reason>)'`];
  const first = criterion.match(/`([^`]+)`/);
  const command = first === null ? '' : first[1].trim();
  const runs = mcpToolCall(command) !== null
    || terms.some((term) => new RegExp(`(?<![\\w/-])(?:\\./)?${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w/-]|\\.\\w)`).test(command));
  if (runs) return [];
  return [`the plan's '## Success criterion' runs no product, though package.json names ${entries}: run one in the command, or add 'Product run: none (<reason>)' under it`];
}

const REFACTOR_HEADING = /^refactor(?:\([^)]*\))?!?:/;

function checkRedGreen(plan, landed) {
  const problems = [];
  for (const task of plan.tasks) {
    if (task.red !== null && task.red.reason === '') problems.push(`Task ${task.number}: 'Red: none' states no reason: write 'Red: none (<reason>)'`);
  }
  if (plan.successRed !== null && plan.successRed.reason === '') problems.push("the plan's Success criterion 'Red: none' states no reason: write 'Red: none (<reason>)'");
  const landGate = frameOf(plan.frame).landGate;
  for (const task of plan.tasks) {
    if (task.red !== null) continue;
    if (equalsLandGate(task.proof ?? undefined, landGate)) {
      problems.push(`Task ${task.number}: 'Proof: ${task.proof}' equals the 'Land gate:' command, so land will refuse it with "no red proof": name a Proof that fails before the task, or add 'Red: none (<reason>)'`);
    } else if (REFACTOR_HEADING.test(task.title) && !landed.includes(task.number)) {
      problems.push(`Task ${task.number}: a refactor task has no 'Red:' field, so land will refuse a Proof that passes before the change with "no red proof": add 'Red: none (<reason>)'; a Proof that fails before the change marks a behavior change, so give the heading type feat or fix instead`);
    }
  }
  const repeat = plan.successRepeat;
  if (repeat !== null && !(repeat.count >= 2 && repeat.count <= 5)) problems.push("the plan's Success criterion 'Repeat:' count is not 2 to 5: write 'Repeat: <2-5> (<reason>)'");
  else if (repeat !== null && repeat.reason === '') problems.push("the plan's Success criterion 'Repeat:' states no reason: write 'Repeat: <2-5> (<reason>)'");
  const command = (plan.frame['Success criterion'] ?? '').match(/`([^`]+)`/)?.[1].trim();
  if (equalsLandGate(command, frameOf(plan.frame).landGate) && plan.successRed === null) {
    problems.push(`the plan's Success criterion '${command}' equals the 'Land gate:' command, so it cannot fail where every task passed: name a command that checks the goal, or add 'Red: none (<reason>)' under it`);
  }
  return problems;
}

function checkFrame(frame) {
  const problems = [];
  if ((frame.Goal ?? '').trim() === '') problems.push("the plan has no '## Goal'");
  if ((frame['Success criterion'] ?? '').trim() === '') problems.push("the plan has no '## Success criterion'");
  const checkpoint = frame.Checkpoint ?? '';
  if (checkpoint.trim() === '') {
    problems.push("the plan has no '## Checkpoint'");
  } else {
    for (const point of CHECKPOINT_POINTS) {
      if (!checkpoint.includes(point)) problems.push(`the plan's '## Checkpoint' has no '${point}' point`);
    }
  }
  return problems;
}

function checkWholeSuiteProof(task) {
  if (task.proof === null || wholeSuiteKeys(task.proof).length === 0) return [];
  return [`Task ${task.number}: 'Proof: ${task.proof}' runs the whole suite: name the one test file or script that shows this task alone landed`];
}

const MERGE_BASE_CALL = /\$\(\s*git merge-base[^)]*\)/g;
const BARE_DEFAULT_DIFF = /\bgit\s+(?:diff|log|show|rev-list|diff-tree)\b[^;&|\n]*?(?<![\w/.-])(main|master)(?=\.\.|[\s"')]|$)/;

function checkBareDefaultBranchProof(task) {
  if (task.proof === null) return [];
  const match = task.proof.replace(MERGE_BASE_CALL, '').match(BARE_DEFAULT_DIFF);
  if (match === null) return [];
  return [`Task ${task.number}: 'Proof: ${task.proof}' diffs against bare \`${match[1]}\`, which moves when the default branch moves: use \`$(git merge-base ${match[1]} HEAD)\` as the base`];
}

function checkCompactFields(task) {
  const problems = [];
  if (task.filesField === null) problems.push(`Task ${task.number}: field line lacks 'Files:'`);
  if (task.proof === null) problems.push(`Task ${task.number}: field line lacks 'Proof:'`);
  if (task.risk !== null && !RISK_CATEGORIES.includes(task.risk)) {
    problems.push(`Task ${task.number}: 'Risk: ${task.risk}' is not one of ${RISK_CATEGORIES.join(', ')}`);
  }
  return [...problems, ...checkWholeSuiteProof(task), ...checkBareDefaultBranchProof(task)];
}

const REDIRECT = /(?:\d*|&)(>>?)\s*(\S*)/g;
const QUOTED = /"(?:\\.|[^"\\])*"|'[^']*'/g;

function redirectsToFile(part) {
  return [...part.replace(QUOTED, '""').matchAll(REDIRECT)].some((match) => !match[2].startsWith('&') && match[2] !== '/dev/null');
}

const realPath = (filePath) => (fs.existsSync(filePath) ? fs.realpathSync(filePath) : path.resolve(filePath));
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

const SESSION_BUILD = '; it may stay: build with exo:build, not run-plan';

function checkLoop(plan, root, planPath) {
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
  return [...problems, ...checkLoopLandGate(basis, root)];
}

const NESTED_CLAUDE = "exo run's sandbox cannot start a nested claude; move the measurement to the Success line, which verify runs outside the sandbox, with a cost cap in that line";
const CLAUDE_COMMAND = /^(?:npx\s+)?claude(?:\s|$)/;
const CLAUDE_IN_SCRIPT = /confinedClaude\(|\(\s*['"`]claude['"`]/;

function startsClaude(part, root) {
  if (CLAUDE_COMMAND.test(part)) return true;
  const script = part.match(/^node\s+(?:--\S+\s+)*(\S+\.mjs)(?:\s|$)/)?.[1];
  if (script === undefined || root === undefined) return false;
  const file = path.resolve(root, script);
  return fs.existsSync(file) && CLAUDE_IN_SCRIPT.test(fs.readFileSync(file, 'utf8'));
}

function checkNestedClaude(plan, root) {
  return loopCommands(plan)
    .filter((entry) => entry.field === 'Proof' || entry.field === 'Allow')
    .flatMap((entry) => entry.parts.filter((part) => startsClaude(part, root)).map((part) => ({ entry, part })))
    .map(({ entry, part }) => `${entry.field}${entry.task === null ? '' : ` of Task ${entry.task}`}: '${part}' starts a nested claude: ${NESTED_CLAUDE}`);
}

function checkDerivedNames(planText, resolvedRoot) {
  if (resolvedRoot === undefined || !fs.existsSync(path.join(resolvedRoot, 'verify/checks/derivation.mjs'))) return [];
  const names = derivedNames();
  return planText.split('\n').flatMap((line, index) => {
    const lowered = line.toLowerCase();
    return names
      .filter((name) => lowered.includes(name))
      .map((name) => `line ${index + 1}: derived name '${name}', which the derivation check refuses in every tracked file: reword it`);
  });
}

export function planCheckReport(planText, { root, loop = false, planPath, run = false } = {}) {
  const plan = parsePlan(planText);
  if (plan.tasks.length === 0) throw new UsageError("the plan holds no '### Task <n>:' heading");
  const compactPlan = plan.tasks.every((task) => task.compact);
  const resolvedRoot = root ?? frameOf(plan.frame).repository ?? undefined;
  const byNumber = new Map(plan.tasks.map((task) => [task.number, task]));
  // why: a landed task's Files: grow after it lands, and a landed task can no longer be fixed, so a resumed or mid-run check measures and flags only unlanded tasks.
  const landed = run && resolvedRoot !== undefined && resolvedRoot !== null && planPath !== undefined ? landedTasks(plan.tasks, resolvedRoot, planIdOf(planPath)) : [];
  const problems = [
    ...(compactPlan
      ? [
          ...checkFrame(plan.frame),
          ...checkPlanBasis(plan.frame, run),
          ...openPoints(planText).map((entry) => `the plan's '## Open points' still holds an unanswered question: ${entry}`),
          ...checkLandGate(plan.frame, resolvedRoot),
          ...checkProductRun(plan.frame, resolvedRoot),
          ...checkRedGreen(plan, landed),
          ...checkAcceptanceCitations(plan.frame),
          ...plan.tasks.flatMap((task) => checkCompactFields(task))
        ]
      : plan.tasks.flatMap((task) => [
          ...checkCommit(task),
          ...checkGitAdd(task),
          ...checkSteps(task),
          ...checkPlaceholders(task),
          ...checkSize(task),
          ...checkFilesExist(task, resolvedRoot, byNumber)
        ])),
    ...plan.tasks.filter((task) => !landed.includes(task.number)).flatMap((task) => checkContextSize(task, resolvedRoot)),
    ...plan.tasks.flatMap((task) => checkUnlistedTests(task, resolvedRoot)),
    ...plan.tasks.filter((task) => !landed.includes(task.number)).flatMap((task) => checkProofTestsListed(task, resolvedRoot, byNumber)),
    ...checkDerivedNames(planText, resolvedRoot),
    ...checkSharedFiles(plan.tasks),
    ...checkParallelForm(plan.frame),
    ...checkParallelDisjoint(plan.tasks, plan.frame),
    ...checkWorktreeSetup(plan.tasks, plan.frame),
    ...checkNestedClaude(plan, resolvedRoot),
    ...(loop ? checkLoop(plan, resolvedRoot, planPath) : [])
  ];
  if (problems.length > 0) return { ok: false, lines: problems };
  const largest = plan.tasks.reduce((best, task) => {
    const size = taskSize(task);
    return size.lines > best.lines ? { number: task.number, lines: size.lines } : best;
  }, { number: plan.tasks[0].number, lines: taskSize(plan.tasks[0]).lines });
  return { ok: true, lines: [`plan-check: ok, ${plan.tasks.length} tasks, largest Task ${largest.number} (${largest.lines} lines)`] };
}

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', root: 'value', loop: 'boolean', run: 'boolean' });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  if (!fs.existsSync(flags.plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const planText = fs.readFileSync(flags.plan, 'utf8');
  const report = planCheckReport(planText, { root: flags.root, loop: flags.loop === true, planPath: flags.plan, run: flags.run === true });
  process.stdout.write(`${report.lines.join('\n')}\n`);
  if (!report.ok) process.exitCode = 1;
}

if (isMain(import.meta.url)) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`plan-check: ${error.message}\n`);
      process.exitCode = 2;
    } else if (error instanceof PlanError) {
      process.stderr.write(`plan-check: ${error.message}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
