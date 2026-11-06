#!/usr/bin/env node
import { originDefaultBranch } from '#git';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { parsePlan } from '#plan-tasks';
import { UsageError, isMain, parseFlags } from '#script-flags';
import { StepError, createPullRequest, refuseBadText, runGh, runGit } from './pull-request.mjs';

const USAGE = 'usage: stack.mjs --plan <plan.md> --body <file> | --restack';
const USAGE_EXIT = 2;
const PARENT_LINE = /^Stack-parent:\s*(\S+)\s*$/m;
const TASK_TRAILER = /^Plan-task:\s*(?:[^\s/]+\/)?(\d+)\s*$/m;
const OPEN_FIELDS = 'number,url,headRefName,baseRefName,body';

function gitText(step, args) {
  const result = runGit(args);
  if (!result.ok) throw new StepError(step, `git=${result.error}`);
  return result.stdout.trim();
}

function ghText(step, args) {
  const result = runGh(args);
  if (!result.ok) throw new StepError(step, `gh=${result.error}`);
  return result.stdout;
}

function defaultBranch(step) {
  const base = originDefaultBranch(process.cwd());
  if (base === null) throw new StepError(step, 'default-branch=unknown');
  return base;
}

function waveByTask(tasks) {
  const waves = new Map();
  for (const task of [...tasks].sort((a, b) => a.number - b.number)) {
    const before = task.dependsOn.map((number) => waves.get(number) ?? 0);
    waves.set(task.number, 1 + Math.max(0, ...before));
  }
  return waves;
}

function commitsAhead(base) {
  const log = gitText('stack', ['log', '--reverse', '--format=%x1e%H%x1f%s%x1f%B', `origin/${base}..HEAD`]);
  return log.split('\x1e').filter((entry) => entry.trim() !== '').map((entry) => {
    const [sha, subject, message] = entry.split('\x1f');
    return { sha: sha.trim(), subject, task: Number(message.match(TASK_TRAILER)?.[1]) || null };
  });
}

function segmentsOf(commits, waves) {
  const segments = [];
  for (const commit of commits) {
    const last = segments.at(-1);
    if (commit.task === null && last === undefined) throw new StepError('stack', `no-plan-task ${commit.sha}`);
    if (commit.task === null) {
      last.sha = commit.sha;
      continue;
    }
    const wave = waves.get(commit.task);
    if (wave === undefined) throw new StepError('stack', `unknown-task ${commit.task}`);
    if (last?.wave === wave) {
      last.sha = commit.sha;
      last.tasks.push(commit.task);
      continue;
    }
    segments.push({ wave, sha: commit.sha, title: commit.subject, tasks: [commit.task] });
  }
  return segments;
}

function stackBody(segment, titles, parent) {
  const lines = segment.tasks.map((number) => `- Task ${number}: ${titles.get(number)}`);
  return `${lines.join('\n')}\n\n${parent === null ? '' : `Stack-parent: ${parent}\n`}`;
}

function tipBody(bodyFile, parent) {
  const text = fs.readFileSync(bodyFile, 'utf8');
  return parent === null ? text : `${text.trimEnd()}\n\nStack-parent: ${parent}\n`;
}

function pullRequestsFor({ segments, branch, base, bodyFile, titles, directory }) {
  return segments.map((segment, index) => {
    const isTip = index === segments.length - 1;
    const name = isTip ? branch : `${branch}-wave-${index + 1}`;
    const parent = index === 0 ? null : `${branch}-wave-${index}`;
    const body = path.join(directory, `${name.replaceAll('/', '-')}.md`);
    fs.writeFileSync(body, isTip ? tipBody(bodyFile, parent) : stackBody(segment, titles, parent));
    return { name, isTip, sha: segment.sha, base: parent ?? base, title: segment.title, body };
  });
}

function pushPullRequest(pullRequest) {
  const args = pullRequest.isTip ? ['push', '-u', 'origin', pullRequest.name] : ['push', 'origin', `${pullRequest.sha}:refs/heads/${pullRequest.name}`];
  gitText('push', args);
}

function openStack(flags) {
  const base = defaultBranch('stack');
  const branch = gitText('stack', ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch === base) throw new StepError('stack', `on-default-branch ${base}`, { code: USAGE_EXIT });
  const { tasks } = parsePlan(fs.readFileSync(flags.plan, 'utf8'));
  const segments = segmentsOf(commitsAhead(base), waveByTask(tasks));
  if (segments.length === 0) throw new StepError('stack', 'no-commits');
  const titles = new Map(tasks.map((task) => [task.number, task.title]));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-stack-'));
  try {
    const pullRequests = pullRequestsFor({ segments, branch, base, bodyFile: flags.body, titles, directory });
    for (const pullRequest of pullRequests) refuseBadText({ route: 'open-pr', title: pullRequest.title, body: pullRequest.body }, pullRequest.name);
    pullRequests.forEach(pushPullRequest);
    return pullRequests.map((pullRequest) => {
      const created = createPullRequest(pullRequest.name, pullRequest.base, { title: pullRequest.title, body: pullRequest.body, issue: undefined });
      return `${created.url} open base ${pullRequest.base}`;
    });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function openPullRequests() {
  return JSON.parse(ghText('restack', ['pr', 'list', '--state', 'open', '--json', OPEN_FIELDS]));
}

function parentOf(pullRequest) {
  return (pullRequest.body ?? '').match(PARENT_LINE)?.[1] ?? null;
}

function mergedTree(base, child) {
  const result = spawnSync('git', ['merge-tree', '--write-tree', `origin/${base}`, `origin/${child.headRefName}`], { encoding: 'utf8' });
  if (result.status === 0) return result.stdout.split('\n')[0].trim();
  if (result.status !== 1) throw new StepError('restack', `git=${(result.stderr ?? '').trim().split('\n')[0]}`, { subject: child.url });
  throw new StepError('restack', `conflict ${child.headRefName} with ${base}, see references/merge-conflicts.md`, { subject: child.url });
}

function syncChild(child, base) {
  const tree = mergedTree(base, child);
  const message = `chore: merge ${base} into ${child.headRefName}`;
  const commit = gitText('restack', ['commit-tree', tree, '-p', `origin/${child.headRefName}`, '-p', `origin/${base}`, '-m', message]);
  gitText('restack', ['push', 'origin', `${commit}:refs/heads/${child.headRefName}`]);
}

function containsBase(child, base) {
  return runGit(['merge-base', '--is-ancestor', `origin/${base}`, `origin/${child.headRefName}`]).ok;
}

function restackChild(child, base) {
  if (!containsBase(child, base)) syncChild(child, base);
  if (child.baseRefName !== base) ghText('restack', ['pr', 'edit', String(child.number), '--base', base]);
  return `${child.url} restacked onto ${base}`;
}

export function restackChildren(mergedHead, base) {
  const children = openPullRequests().filter((pullRequest) => parentOf(pullRequest) === mergedHead);
  if (children.length === 0) return [];
  gitText('restack', ['fetch', 'origin']);
  return children.map((child) => restackChild(child, base));
}

function isMerged(branch) {
  return JSON.parse(ghText('restack', ['pr', 'list', '--state', 'merged', '--head', branch, '--json', 'number'])).length > 0;
}

function restackAll() {
  const base = defaultBranch('restack');
  const parents = new Set(openPullRequests().map(parentOf).filter((parent) => parent !== null));
  return [...parents].filter(isMerged).flatMap((parent) => restackChildren(parent, base));
}

function readFlags(argv) {
  const flags = parseFlags(argv, { plan: 'value', body: 'value', restack: 'boolean' }, { usage: USAGE });
  if (flags.restack && (flags.plan || flags.body)) throw new UsageError('--restack takes no other flags');
  if (!flags.restack && !(flags.plan && flags.body)) throw new UsageError('--plan and --body go together');
  return flags;
}

function main() {
  let flags;
  try {
    flags = readFlags(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`${USAGE}: ${error.message}`);
    process.exitCode = USAGE_EXIT;
    return;
  }
  try {
    for (const line of flags.restack ? restackAll() : openStack(flags)) console.log(line);
    process.exitCode = 0;
  } catch (error) {
    if (!(error instanceof StepError)) throw error;
    console.log(`${error.subject ?? 'stack'} stopped ${error.step} ${error.message}`);
    process.exitCode = error.code;
  }
}

if (isMain(import.meta.url)) {
  main();
}
