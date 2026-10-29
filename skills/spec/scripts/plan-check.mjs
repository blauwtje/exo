import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { environmentMs, parseFlags, UsageError, isMain } from '#script-flags';
import { codeBlocks, defaultBase, defaultBranch, frameOf, isCovered, landedTasks, loopCommands, openPoints, parallelValueValid, parsePlan, planIdOf, PlanError, taskSize } from '#plan-tasks';
import { BYTES_PER_TOKEN, capHeadroomTokens, TASK_SPLIT_TOKENS } from '#context-limits';
import { subjectProblem } from '#commit-text';
import { dataLiterals, literalFinder, literalFragments } from '#data-literals';
import { derivedNames } from '#derivation';
import { equalsLandGate } from '#land-gate';
import { isEvidenceValue, WORDING_PATH } from '#evidence-rules';
import { mcpToolCall } from '#mcp-tool-call';
import { isTestPath } from '#red-green';
import { packageEntryPoints, packageRunTerms } from '#package-entry-point';
import { wholeSuiteKeys } from '#suite-command';

const NAMED_HEADING = /`(#{1,6}) ([^`\n]+)`/g;
const STEP_HEADING = /^Step \d+: .*$/;
const PLACEHOLDER_ELLIPSIS = /(?<![.\w])\.\.\.(?!\w)/;
const MAX_LINES = 250;
const MAX_FILES = 4;
const BODY_SIZE_TIMEOUT_MS = 60_000;
const TINY_TASK_TOKENS = 2000;
const TINY_TASK_BYTES = TINY_TASK_TOKENS * BYTES_PER_TOKEN;
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

function bytesAtCommit(root, commit, target) {
  const listing = spawnSync('git', ['-C', root, 'ls-tree', '-r', '-l', '-z', commit, '--', target], { encoding: 'utf8', maxBuffer: Infinity });
  if (listing.status !== 0) return 0;
  return listing.stdout
    .split('\0')
    .map((entry) => entry.match(/^\d+ blob \w+ +(\d+)\t/))
    .filter((match) => match !== null)
    .reduce((total, match) => total + Number(match[1]), 0);
}

function forkPointOf(root) {
  const base = defaultBase(root);
  if (base === null) return null;
  const fork = spawnSync('git', ['-C', root, 'merge-base', base, 'HEAD'], { encoding: 'utf8' });
  return fork.status === 0 ? fork.stdout.trim() : null;
}

function textAtCommit(root, commit, target) {
  const shown = spawnSync('git', ['-C', root, 'show', `${commit}:${target}`], { encoding: 'utf8', maxBuffer: Infinity });
  return shown.status === 0 ? shown.stdout : null;
}

function textOnDisk(target) {
  try {
    return fs.readFileSync(target, 'utf8');
  } catch {
    return null;
  }
}

function linesEqual(lines, target) {
  return lines.flatMap((line, index) => (line === target ? [index] : []));
}

function headingSectionBytes(text, taskText) {
  const named = [...taskText.matchAll(NAMED_HEADING)].map((match) => ({ level: match[1].length, line: `${match[1]} ${match[2]}` }));
  if (named.length === 0) return null;
  const outerLevel = Math.min(...named.map((heading) => heading.level));
  const outers = named.filter((heading) => heading.level === outerLevel);
  if (outers.length !== 1) return null;
  const lines = text.split('\n');
  const starts = linesEqual(lines, outers[0].line);
  if (starts.length !== 1) return null;
  const closing = new RegExp(`^#{1,${outerLevel}} `);
  const following = lines.findIndex((line, index) => index > starts[0] && closing.test(line));
  const section = lines.slice(starts[0], following === -1 ? lines.length : following);
  if (named.some((heading) => linesEqual(section, heading.line).length !== 1)) return null;
  return Buffer.byteLength(section.join('\n'));
}

function referencingLinesBytes(text, others) {
  const paths = others.map((other) => other.path).filter((otherPath) => !otherPath.endsWith('/'));
  const matching = text.split('\n').filter((line) => paths.some((otherPath) => line.includes(otherPath)));
  return matching.length === 0 ? null : Buffer.byteLength(matching.join('\n'));
}

function taskBytes(task, root, forkPoint) {
  const wholeSize = (file) => (forkPoint === null ? bytesUnder(path.join(root, file.path)) : bytesAtCommit(root, forkPoint, file.path));
  const textOf = (file) => (forkPoint === null ? textOnDisk(path.join(root, file.path)) : textAtCommit(root, forkPoint, file.path));
  const sizeOf = (file) => {
    const text = textOf(file);
    const referencing = text === null ? null : referencingLinesBytes(text, task.files.filter((other) => other !== file));
    if (referencing !== null) return referencing;
    if (!file.path.endsWith('.md')) return wholeSize(file);
    return (text === null ? null : headingSectionBytes(text, task.section)) ?? wholeSize(file);
  };
  return Buffer.byteLength(task.section) + task.files.reduce((total, file) => total + sizeOf(file), 0);
}

// why: two adjacent tiny tasks on the same files and one chain each pay a session start that one merged task would pay once.
function warnTinyTasks(tasks, { root, forkPoint, landed }) {
  if (root === undefined || root === null) return [];
  const byNumber = new Map(tasks.map((task) => [task.number, task]));
  const tiny = (task) => !landed.includes(task.number) && taskBytes(task, root, forkPoint) < TINY_TASK_BYTES;
  const warnings = [];
  for (let i = 0; i + 1 < tasks.length; i++) {
    const [first, second] = [tasks[i], tasks[i + 1]];
    const secondPaths = new Set(second.files.map((file) => file.path));
    if (!first.files.some((file) => secondPaths.has(file.path))) continue;
    if (!reachesThrough(byNumber, second.number, first.number)) continue;
    if (tiny(first) && tiny(second)) warnings.push(`warning: Task ${first.number} and Task ${second.number} are both tiny (under ${TINY_TASK_TOKENS} tokens of task text and Files:) and share Files: and a Depends on chain: merge them into one task`);
  }
  return warnings;
}

function rootBodySizes(root) {
  const verify = (name) => JSON.stringify(pathToFileURL(path.join(root, 'verify', name)).href);
  const script = `const [{ bodySizes }, { createRepository }] = await Promise.all([import(${verify('body-size.mjs')}), import(${verify('repository.mjs')})]); process.stdout.write(JSON.stringify(bodySizes(createRepository(process.argv[1]))));`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, root], { encoding: 'utf8', timeout: environmentMs('EXO_BODY_SIZE_TIMEOUT_MS', BODY_SIZE_TIMEOUT_MS), maxBuffer: Infinity });
  if (child.status !== 0) return { reason: (child.stderr || child.error?.message || 'no output').trim().split('\n')[0] };
  return { records: JSON.parse(child.stdout) };
}

const dirOf = (file) => path.posix.dirname(file);

// why: a task that edits a skill or agent already near its body cap fails the verify budget check after landing; the plan can raise the lock in the same task instead.
function warnNearCap(tasks, root, landed) {
  if (root === undefined || root === null || !fs.existsSync(path.join(root, 'verify/budgets.mjs'))) return [];
  const sized = rootBodySizes(root);
  if (sized.reason !== undefined) return [`warning: headroom check skipped, the root's verify/body-size.mjs failed: ${sized.reason}`];
  const limit = capHeadroomTokens();
  const near = new Map(sized.records.filter((record) => record.headroom < limit).map((record) => [record.path, record]));
  const withReferences = new Set();
  return tasks.flatMap((task) => {
    for (const file of task.files) if (file.path.includes('/references/')) withReferences.add(file.path.slice(0, file.path.indexOf('/references/')));
    if (landed.includes(task.number)) return [];
    return task.files
      .filter((file) => near.has(file.path) && !withReferences.has(dirOf(file.path)))
      .map((file) => `warning: Task ${task.number} edits ${file.path}, which has ${near.get(file.path).headroom} tokens of body headroom (cap ${near.get(file.path).cap}): trim it in the same task or raise its cap`);
  });
}

function checkContextSize(task, root, forkPoint) {
  if (root === undefined || root === null) return [];
  const bytes = taskBytes(task, root, forkPoint);
  const tokens = Math.ceil(bytes / BYTES_PER_TOKEN);
  if (tokens <= TASK_SPLIT_TOKENS) return [];
  return [`Task ${task.number}: split Task ${task.number} (about ${tokens} tokens of task text and Files:, over ${TASK_SPLIT_TOKENS})`];
}

function sizeLines(tasks, root, forkPoint) {
  if (root === undefined || root === null) return [];
  return tasks.map((task) => `Task ${task.number}: about ${Math.ceil(taskBytes(task, root, forkPoint) / BYTES_PER_TOKEN)} tokens of task text and Files:`);
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

// why: `run-` also starts the names of tests of `run-session.mjs`, so a name match counts only when the test, or a helper it imports, names the source file.
function existingTestsOf(sourcePath, testFiles, root) {
  const base = path.parse(sourcePath).name;
  const fileName = path.posix.basename(sourcePath);
  return testFiles
    .filter((name) => name === `${base}.test.mjs` || (name.startsWith(`${base}-`) && name.endsWith('.test.mjs')))
    .filter((name) => testTextsOf(path.join(root, 'tests', name)).some((text) => mentions(text, fileName)))
    .map((name) => `tests/${name}`);
}

const LOCKS_AND_REGISTRIES = [
  'verify/budgets.mjs',
  'verify/model-kinds.mjs',
  'lib/model-kinds.json',
  'verify/checks/reference-tables.mjs',
  'verify/instruction-density-allowlist.txt',
  'CONTRIBUTING.md'
];
const REPO_PATH_ORIGIN = /import\.meta\.(?:url|dirname)/;

function mentions(text, needle) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`).test(text);
}

function filesUnder(root) {
  const listing = spawnSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', maxBuffer: Infinity });
  if (listing.status === 0) return listing.stdout.split('\0').filter((name) => name !== '');
  const walk = (directory) => fs.readdirSync(path.join(root, directory), { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith('.') && entry.name !== 'node_modules')
    .flatMap((entry) => (entry.isDirectory() ? walk(path.posix.join(directory, entry.name)) : [path.posix.join(directory, entry.name)]));
  return walk('');
}

function namesEntry(text, entryPath, otherBasenames) {
  if (mentions(text, entryPath)) return true;
  const base = path.posix.basename(entryPath);
  return !otherBasenames.has(base) && mentions(text, base);
}

function testTextsOf(testPath) {
  const texts = [fs.readFileSync(testPath, 'utf8')];
  for (const match of texts[0].matchAll(/from\s+'(\.[^']+\.mjs)'/g)) {
    const helper = path.resolve(path.dirname(testPath), match[1]);
    if (fs.existsSync(helper)) texts.push(fs.readFileSync(helper, 'utf8'));
  }
  return texts;
}

// why: a constant bound to import.meta.url or import.meta.dirname, in the test or a helper it imports, points at the repository; any other path is a temp-folder copy.
function repoPathNames(testPath) {
  let names = new Set();
  const texts = testTextsOf(testPath);
  const bindings = texts.flatMap((text) => [...text.matchAll(/(?:const|let)\s+(\w+)\s*=\s*([^;\n]*)/g)].map((match) => [match[1], match[2]]));
  for (;;) {
    const next = new Set(bindings.filter(([, value]) => pointsAtRepository(value, names)).map(([name]) => name));
    if (next.size === names.size) return names;
    names = next;
  }
}

function pointsAtRepository(text, names) {
  return REPO_PATH_ORIGIN.test(text) || [...names].some((name) => new RegExp(`\\b${name}\\b`).test(text));
}

function readsRepositoryFile(lines, entry, names) {
  return lines.some((line) => /\breadFile(?:Sync)?\b/.test(line) && namesEntry(line, entry.path, entry.others) && pointsAtRepository(line, names));
}

function lockProblems(task, root, sources, later) {
  const listed = [...task.files.map((file) => file.path), ...later];
  return LOCKS_AND_REGISTRIES.filter((lock) => !isCovered(listed, lock) && fs.existsSync(path.join(root, lock))).flatMap((lock) => {
    const text = fs.readFileSync(path.join(root, lock), 'utf8');
    return sources
      .filter((source) => (lock === 'CONTRIBUTING.md' ? mentions(text, source.path) : namesEntry(text, source.path, source.others)))
      .map((source) => `Task ${task.number}: \`${lock}\` names Files: \`${source.path}\` and Files: does not list \`${lock}\``);
  }).concat(lockConstantProblems(task, root, listed));
}

function lockConstantProblems(task, root, listed) {
  const text = `${task.title}\n${task.section}`;
  return LOCKS_AND_REGISTRIES.filter((lock) => !isCovered(listed, lock) && fs.existsSync(path.join(root, lock))).flatMap((lock) => {
    const names = [...fs.readFileSync(path.join(root, lock), 'utf8').matchAll(/export const ([A-Z][A-Z0-9_]*_(?:LOCK|BUDGET|ALLOWLIST))\b/g)].map((match) => match[1]);
    return names.filter((name) => mentions(text, name)).map((name) => `Task ${task.number}: names \`${name}\` from \`${lock}\` and Files: does not list \`${lock}\``);
  });
}

function readerProblems(task, root, sources) {
  const testFiles = fs.readdirSync(path.join(root, 'tests'));
  const listed = task.files.map((file) => file.path);
  const readable = sources.filter((source) => !LOCKS_AND_REGISTRIES.includes(source.path));
  return testFiles.filter((name) => name.endsWith('.test.mjs') && !isCovered(listed, `tests/${name}`)).flatMap((name) => {
    const testPath = path.join(root, 'tests', name);
    const lines = fs.readFileSync(testPath, 'utf8').split('\n');
    const names = repoPathNames(testPath);
    return readable
      .filter((source) => readsRepositoryFile(lines, source, names))
      .map((source) => `Task ${task.number}: \`tests/${name}\` reads Files: \`${source.path}\` and Files: does not list \`tests/${name}\``);
  });
}

function checkUnlistedTests(task, root, byNumber) {
  if (root === undefined || root === null) return [];
  const testsDir = path.join(root, 'tests');
  if (!fs.existsSync(testsDir)) return [];
  const testFiles = fs.readdirSync(testsDir);
  const listed = task.files.map((file) => file.path);
  const sources = task.files.filter((file) => file.kind !== 'Create' && !file.path.endsWith('/') && !file.path.endsWith('.test.mjs') && file.path !== 'CHANGELOG.md');
  const problems = [];
  for (const source of sources) {
    const tests = existingTestsOf(source.path, testFiles, root);
    if (tests.length === 0 || tests.some((testPath) => isCovered(listed, testPath))) continue;
    problems.push(`Task ${task.number}: Files: \`${source.path}\` has existing tests ${tests.map((testPath) => `\`${testPath}\``).join(', ')} and lists none of them`);
  }
  if (sources.length === 0) return problems;
  const tracked = filesUnder(root);
  const withOthers = sources.map((source) => ({
    path: source.path,
    others: new Set(tracked.filter((name) => name !== source.path).map((name) => path.posix.basename(name)))
  }));
  return [...problems, ...lockProblems(task, root, withOthers, laterChainedPaths(byNumber, task.number)),...readerProblems(task, root, withOthers)];
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

function laterChainedPaths(byNumber, number) {
  return [...byNumber.values()]
    .filter((other) => reachesThrough(byNumber, other.number, number))
    .flatMap((other) => other.files.map((file) => file.path));
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
  if (/^Land: (local|push-main)$/m.test(basis)) {
    const commit = frameOf(frame).commit;
    const problem = commit === null ? 'it is missing' : subjectProblem(commit);
    if (problem !== null) problems.push(`the plan's '## Plan basis' needs a 'Commit: <type>(<scope>): <subject>' line when Land is local or push-main: ${problem}`);
  }
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
    } else if (!landed.includes(task.number) && task.files.length > 0 && task.files.every((file) => isTestPath(file.path))) {
      problems.push(`Task ${task.number}: the Files are all tests and the task has no 'Red:' field, so its Proof passes before the change and land will refuse it with "no red proof": add a source file to Files, or add 'Red: none (<reason>)'`);
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

const BOUNDARY_FORMAT = "'Boundary: in <accepted input> | out <rejected input> | test <test file in Files>'";

function checkBoundary(task) {
  if (task.risk !== 'security boundary') return [];
  if (task.boundary === null) return [`Task ${task.number}: 'Risk: security boundary' has no 'Boundary:' field: add ${BOUNDARY_FORMAT}`];
  const listed = task.files.map((file) => file.path);
  if (isCovered(listed, task.boundary.test)) return [];
  return [`Task ${task.number}: 'Boundary:' test \`${task.boundary.test}\` is not in Files:: use ${BOUNDARY_FORMAT}`];
}

function checkCompactFields(task) {
  const problems = [];
  if (task.filesField === null) problems.push(`Task ${task.number}: field line lacks 'Files:'`);
  if (task.proof === null) problems.push(`Task ${task.number}: field line lacks 'Proof:'`);
  if (task.risk !== null && !RISK_CATEGORIES.includes(task.risk)) {
    problems.push(`Task ${task.number}: 'Risk: ${task.risk}' is not one of ${RISK_CATEGORIES.join(', ')}`);
  }
  return [...problems, ...checkBoundary(task), ...checkWholeSuiteProof(task), ...checkBareDefaultBranchProof(task)];
}

const WORDING_FOLDER = /^(?:skills\/(?:[^/]+\/(?:references\/)?)?|agents\/|hooks\/|harnesses\/codex\/)$/;

function checkEvidence(plan) {
  const named = plan.tasks.filter((task) => task.evidence !== null);
  const problems = named
    .filter((task) => !isEvidenceValue(task.evidence.trim()))
    .map((task) => `Task ${task.number}: 'Evidence: ${task.evidence}' is not 'benchmarks/results/<file>', 'benchmarks/pressure/<path>' or 'none (<reason>)'`);
  const wording = plan.tasks.find((task) => task.files.some((file) => WORDING_PATH.test(file.path) || WORDING_FOLDER.test(file.path)));
  if (wording !== undefined && named.length === 0) {
    problems.push(`Task ${wording.number}: Files change skill, agent or session wording and no task has an 'Evidence:' field: add '| Evidence: <benchmarks/results/<file> | benchmarks/pressure/<path> | none (<reason>)>' to one task`);
  }
  return problems;
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

const HTML_ENTITY = /&(?:gt|lt|amp|quot|apos|#\d+|#x[0-9a-f]+);/i;

// why: land runs the raw 'Land gate:' and 'Lint:' text in a shell, so a wrapping backtick pair becomes a command substitution; rejecting here keeps one reading of the field in every consumer.
function checkRunCommands(plan) {
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

function checkNestedClaude(plan, root) {
  return loopCommands(plan)
    .filter((entry) => entry.field === 'Proof' || entry.field === 'Allow')
    .flatMap((entry) => entry.parts.filter((part) => startsClaude(part, root)).map((part) => ({ entry, part })))
    .map(({ entry, part }) => `${entry.field}${entry.task === null ? '' : ` of Task ${entry.task}`}: '${part}' starts a nested claude: ${NESTED_CLAUDE}`);
}

function hasHead(root) {
  return spawnSync('git', ['-C', root, 'rev-parse', '--verify', '-q', 'HEAD'], { stdio: 'ignore' }).status === 0;
}

// why: land searches names relative to the run worktree, so an absolute, outside or ignored path is one it can never find.
function namesUnsearchablePath(fragment, root) {
  const target = path.resolve(root, fragment);
  if (!fs.existsSync(target)) return false;
  const relative = path.relative(root, fs.realpathSync(target));
  if (path.isAbsolute(fragment) || relative.startsWith('..') || path.isAbsolute(relative)) return true;
  return spawnSync('git', ['-C', root, 'check-ignore', '-q', '--', relative], { stdio: 'ignore' }).status === 0;
}

function checkDataLiterals(task, root, planPath) {
  if (task.literals !== null || !task.data || !hasHead(root)) return [];
  const candidates = [...new Set(dataLiterals(task.data))].filter((literal) => literalFragments(literal).some((fragment) => namesUnsearchablePath(fragment, root)));
  if (candidates.length === 0) return [];
  const found = literalFinder(root, planPath);
  const flagged = candidates.filter((literal) => !found(literal) && literalFragments(literal).some((fragment) => namesUnsearchablePath(fragment, root) && !found(fragment)));
  if (flagged.length === 0) return [];
  return [`Task ${task.number}: Data: names ${flagged.map((literal) => `\`${literal}\``).join(', ')}, a path the land check cannot search (absolute, outside the repository or git-ignored); name it relative to the repository, or add \`Literals: none (<reason>)\``];
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
  // why: earlier tasks of a run grow the Files: of later ones, so a mid-run check measures each Files: path at the commit the run branch forked from, the size spec checked.
  const forkPoint = run && resolvedRoot !== undefined && resolvedRoot !== null ? forkPointOf(resolvedRoot) : null;
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
          ...checkEvidence(plan),
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
    ...plan.tasks.filter((task) => !landed.includes(task.number)).flatMap((task) => checkContextSize(task, resolvedRoot, forkPoint)),
    ...plan.tasks.flatMap((task) => checkUnlistedTests(task, resolvedRoot, byNumber)),
    ...plan.tasks.filter((task) => !landed.includes(task.number)).flatMap((task) => checkProofTestsListed(task, resolvedRoot, byNumber)),
    ...(resolvedRoot === undefined || resolvedRoot === null || !fs.existsSync(resolvedRoot)
      ? []
      : plan.tasks.filter((task) => !landed.includes(task.number)).flatMap((task) => checkDataLiterals(task, realPath(resolvedRoot), planPath === undefined ? null : realPath(planPath)))),
    ...checkDerivedNames(planText, resolvedRoot),
    ...checkSharedFiles(plan.tasks),
    ...checkParallelForm(plan.frame),
    ...checkParallelDisjoint(plan.tasks, plan.frame),
    ...checkWorktreeSetup(plan.tasks, plan.frame),
    ...checkNestedClaude(plan, resolvedRoot),
    ...checkRunCommands(plan),
    ...(loop ? checkLoop(plan, resolvedRoot, planPath) : [])
  ];
  const warnings = [...warnTinyTasks(plan.tasks, { root: resolvedRoot, forkPoint, landed }), ...warnNearCap(plan.tasks, resolvedRoot, landed)];
  if (problems.length > 0) return { ok: false, lines: [...problems, ...warnings] };
  const largest = plan.tasks.reduce((best, task) => {
    const size = taskSize(task);
    return size.lines > best.lines ? { number: task.number, lines: size.lines } : best;
  }, { number: plan.tasks[0].number, lines: taskSize(plan.tasks[0]).lines });
  return { ok: true, lines: [`plan-check: ok, ${plan.tasks.length} tasks, largest Task ${largest.number} (${largest.lines} lines)`, ...sizeLines(plan.tasks.filter((task) => !landed.includes(task.number)), resolvedRoot, forkPoint), ...warnings] };
}

const USAGE = [
  'usage: plan-check.mjs --plan <plan> [--root <dir>] [--loop] [--run]',
  'Checks a plan file against the plan rules and prints each problem; exits 1 when the plan fails, 2 on a usage error.',
  '--loop adds the checks a headless run needs; --run lets a plan leave out the Land: line.'
].join('\n');

function main(argv) {
  const flags = parseFlags(argv, { plan: 'value', root: 'value', loop: 'boolean', run: 'boolean' }, { usage: USAGE });
  if (flags.plan === undefined) throw new UsageError("flag '--plan' names the plan file");
  if (!fs.existsSync(flags.plan)) throw new UsageError(`no plan at '${flags.plan}'`);
  const planText = fs.readFileSync(flags.plan, 'utf8');
  const root = flags.root ?? frameOf(parsePlan(planText).frame).repository ?? undefined;
  if (root !== undefined && !fs.existsSync(root)) {
    process.stdout.write(`Repository: ${root} does not exist\n`);
    process.exitCode = 1;
    return;
  }
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
