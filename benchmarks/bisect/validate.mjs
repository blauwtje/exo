import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const KINDS = ['regression', 'never-worked', 'flaky', 'plain'];
const TIERS = ['quick', 'full'];
const COMMIT_RANGE = [30, 300];
const BUILD_LIMIT_MS = 10000;
const REPRO_LIMIT_MS = 60000;
const SAMPLE_EVERY = 7;
const FLAKY_RUNS = 20;
const WORKED_BEFORE = /last (week|month|sprint|release)|weeks? ago|was (passing|fine|green)|passed|green|handled this fine|every time/i;
const EXPECTED = { kinds: { regression: 10, 'never-worked': 1, flaky: 1, plain: 1 }, quickRegressions: 3, quickTotal: 4 };

function shell(cwd, command) {
  return spawnSync('sh', ['-c', command], { cwd, encoding: 'utf8', timeout: REPRO_LIMIT_MS });
}

function passes(cwd, command) {
  return shell(cwd, command).status === 0;
}

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}

function build(slug, dest) {
  const started = Date.now();
  const result = spawnSync('node', [path.join(ROOT, slug, 'build.mjs'), dest], { encoding: 'utf8' });
  return { ms: Date.now() - started, status: result.status, stderr: result.stderr };
}

function history(dir) {
  return git(dir, 'log', '--reverse', '--format=%H%x09%s', 'main').split('\n').map((line) => {
    const [sha, ...subject] = line.split('\t');
    return { sha, subject: subject.join('\t') };
  });
}

function greenAt(dir, sha, command) {
  git(dir, 'checkout', '-q', '--detach', sha);
  return passes(dir, command);
}

function sampledIndexes(count, extra) {
  const indexes = new Set(extra);
  for (let i = 0; i < count; i += SAMPLE_EVERY) indexes.add(i);
  indexes.add(count - 1);
  return [...indexes].filter((i) => i >= 0 && i < count).sort((a, b) => a - b);
}

function configProblems(config, prompt) {
  const problems = [];
  if (!KINDS.includes(config.kind)) problems.push(`kind ${config.kind}`);
  if (!TIERS.includes(config.tier)) problems.push(`tier ${config.tier}`);
  if (typeof config.repro !== 'string' || !config.repro) problems.push('repro missing');
  if (!(config.timeoutMinutes > 0)) problems.push('timeoutMinutes');
  if (config.kind === 'regression' && typeof config.culprit !== 'string') problems.push('culprit must be a subject');
  if (config.kind !== 'regression' && config.culprit !== null) problems.push('culprit must be null');
  if (config.kind === 'flaky' && !Number.isInteger(config.flakyRuns)) problems.push('flakyRuns must be an integer');
  if (!prompt.trim()) problems.push('prompt empty');
  if (!prompt.includes(config.repro)) problems.push('prompt lacks the repro command');
  if (/bisect/i.test(prompt)) problems.push('prompt mentions bisect');
  if (config.kind === 'plain' && WORKED_BEFORE.test(prompt)) problems.push('plain prompt claims it worked before');
  if (config.kind !== 'plain' && !WORKED_BEFORE.test(prompt)) problems.push('prompt does not say it worked before');
  return problems;
}

function repoProblems(dir, commits, buildInfo, slug) {
  const problems = [];
  if (buildInfo.ms > BUILD_LIMIT_MS) problems.push(`build took ${buildInfo.ms} ms`);
  if (commits.length < COMMIT_RANGE[0] || commits.length > COMMIT_RANGE[1]) problems.push(`commit count ${commits.length}`);
  if (git(dir, 'rev-parse', '--abbrev-ref', 'HEAD') !== 'main') problems.push('HEAD is not main');
  if (git(dir, 'status', '--porcelain')) problems.push('tree is not clean');
  const again = path.join(path.dirname(dir), 'again');
  const second = build(slug, again);
  if (second.status !== 0 || git(again, 'rev-parse', 'HEAD') !== commits.at(-1).sha) problems.push('build is not deterministic');
  return problems;
}

function regressionProblems(dir, config, commits) {
  const matches = commits.map((commit, index) => ({ ...commit, index })).filter((commit) => commit.subject === config.culprit);
  if (matches.length !== 1) return [`culprit subject matches ${matches.length} commits`];
  const index = matches[0].index;
  const problems = [];
  const ratio = index / (commits.length - 1);
  if (ratio < 0.3 || ratio > 0.85) problems.push(`culprit at ${Math.round(ratio * 100)}% of history`);
  if (index > commits.length - 6) problems.push('culprit in the last 5 commits');
  if (index === 0) return [...problems, 'culprit is the root commit'];
  for (const i of sampledIndexes(commits.length, [index - 1, index])) {
    const expectGreen = i < index;
    if (greenAt(dir, commits[i].sha, config.repro) !== expectGreen) problems.push(`commit ${i} is ${expectGreen ? 'red' : 'green'}`);
  }
  git(dir, 'checkout', '-q', 'main');
  return problems;
}

function neverWorkedProblems(dir, config, commits) {
  const problems = [];
  for (const i of sampledIndexes(commits.length, [0])) {
    if (greenAt(dir, commits[i].sha, config.repro)) problems.push(`commit ${i} is green`);
  }
  git(dir, 'checkout', '-q', 'main');
  return problems;
}

function flakyProblems(dir, config) {
  const outcomes = Array.from({ length: FLAKY_RUNS }, () => passes(dir, config.repro));
  const passed = outcomes.filter(Boolean).length;
  if (passed === 0 || passed === FLAKY_RUNS) return [`${passed} of ${FLAKY_RUNS} runs passed at HEAD`];
  return [];
}

function headProblems(dir, config) {
  if (config.kind === 'flaky') return flakyProblems(dir, config);
  return passes(dir, config.repro) ? ['HEAD is green'] : [];
}

function kindProblems(dir, config, commits) {
  const problems = headProblems(dir, config);
  if (config.kind === 'regression') problems.push(...regressionProblems(dir, config, commits));
  if (config.kind === 'never-worked') problems.push(...neverWorkedProblems(dir, config, commits));
  return problems;
}

function validateCase(slug) {
  const caseDir = path.join(ROOT, slug);
  const config = JSON.parse(readFileSync(path.join(caseDir, 'case.json'), 'utf8'));
  const prompt = readFileSync(path.join(caseDir, 'prompt.md'), 'utf8');
  const problems = configProblems(config, prompt);
  const tmp = mkdtempSync(path.join(tmpdir(), `bisect-${slug}-`));
  try {
    const dir = path.join(tmp, 'repo');
    const info = build(slug, dir);
    if (info.status !== 0) return { config, problems: [...problems, `build failed: ${info.stderr.trim()}`] };
    const commits = history(dir);
    problems.push(...repoProblems(dir, commits, info, slug));
    problems.push(...kindProblems(dir, config, commits));
    const culprit = commits.findIndex((commit) => commit.subject === config.culprit);
    return { config, problems, commits: commits.length, culprit: culprit < 0 ? null : culprit };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function suiteProblems(results) {
  const problems = [];
  for (const [kind, expected] of Object.entries(EXPECTED.kinds)) {
    const actual = results.filter((result) => result.config.kind === kind).length;
    if (actual !== expected) problems.push(`${actual} ${kind} cases, expected ${expected}`);
  }
  const quick = results.filter((result) => result.config.tier === 'quick');
  const quickRegressions = quick.filter((result) => result.config.kind === 'regression').length;
  if (quick.length !== EXPECTED.quickTotal || quickRegressions !== EXPECTED.quickRegressions) problems.push(`quick tier has ${quickRegressions} regressions in ${quick.length} cases`);
  return problems;
}

function caseSlugs() {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(ROOT, entry.name, 'case.json')))
    .map((entry) => entry.name)
    .sort();
}

function report(slug, result) {
  const { config, problems, commits, culprit } = result;
  if (problems.length) return `FAIL ${slug}: ${problems.join('; ')}`;
  return `OK ${slug} kind=${config.kind} tier=${config.tier} commits=${commits} culprit=${culprit ?? 'none'}`;
}

function main() {
  const results = [];
  let failed = false;
  for (const slug of caseSlugs()) {
    const result = validateCase(slug);
    console.log(report(slug, result));
    failed ||= result.problems.length > 0;
    results.push(result);
  }
  const suite = suiteProblems(results);
  for (const problem of suite) console.log(`FAIL suite: ${problem}`);
  failed ||= suite.length > 0;
  console.log(`${results.length} cases, ${failed ? 'FAIL' : 'all OK'}`);
  process.exit(failed ? 1 : 0);
}

main();
