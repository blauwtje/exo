#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { isMain, parseFlags, UsageError, USAGE_EXIT } from '#script-flags';

const USAGE = 'usage: pr-state.mjs --pr <n>';
const LOG_LINES = 20;
const FAILED = new Set(['FAILURE', 'TIMED_OUT', 'CANCELLED', 'STARTUP_FAILURE', 'ACTION_REQUIRED', 'ERROR']);
const VIEW_FIELDS = 'state,mergeable,baseRefName,statusCheckRollup';

function cli(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error?.code === 'ENOENT') throw new Error(`missing tool: ${command} on PATH`);
  return { ok: result.status === 0, status: result.status, stdout: (result.stdout ?? '').trim() };
}

function failingChecks(rollup) {
  return rollup.filter((check) => FAILED.has(check.conclusion ?? check.state));
}

function logTail(check) {
  const job = /\/job\/(\d+)/.exec(check.detailsUrl ?? check.targetUrl ?? '')?.[1];
  if (!job) return ['(no log)'];
  const log = cli('gh', ['run', 'view', '--job', job, '--log-failed']);
  if (!log.ok) return ['(log unavailable)'];
  return log.stdout.split('\n').slice(-LOG_LINES);
}

function conflictedFiles() {
  return cli('git', ['diff', '--name-only', '--diff-filter=U']).stdout.split('\n').filter(Boolean);
}

function inlineComments(number) {
  const result = cli('gh', ['api', '--paginate', `repos/{owner}/{repo}/pulls/${number}/comments`]);
  if (!result.ok) return null;
  return JSON.parse(result.stdout || '[]').map((comment) => `${comment.path}:${comment.line ?? comment.original_line} ${comment.user?.login}: ${comment.body}`);
}

function section(title, lines) {
  if (lines === null) return [`${title}: unknown`];
  return lines.length === 0 ? [`${title}: none`] : [`${title}:`, ...lines];
}

function prState(number) {
  const view = cli('gh', ['pr', 'view', number, '--json', VIEW_FIELDS]);
  if (!view.ok) throw new Error(`gh pr view ${number} failed`);
  const pr = JSON.parse(view.stdout);
  const failing = failingChecks(pr.statusCheckRollup ?? []).flatMap((check) => [`- ${check.name ?? check.context}`, ...logTail(check).map((line) => `    ${line}`)]);
  const conflicts = conflictedFiles();
  const ancestry = cli('git', ['merge-base', '--is-ancestor', `origin/${pr.baseRefName}`, 'HEAD']);
  const mergeBase = ancestry.ok ? 'ok' : ancestry.status === 1 ? 'behind' : 'unknown';
  return [
    `State: ${pr.state}`,
    `Mergeable: ${pr.mergeable}`,
    conflicts.length === 0 ? 'Conflicted files: none' : `Conflicted files: ${conflicts.join(', ')}`,
    ...section('Failing checks', failing),
    ...section('Inline comments', inlineComments(number)),
    `Merge base: ${mergeBase}`
  ].join('\n');
}

function main() {
  try {
    const flags = parseFlags(process.argv.slice(2), { pr: 'value' }, { usage: USAGE });
    if (!/^\d+$/.test(flags.pr ?? '')) throw new UsageError('--pr needs a number');
    console.log(prState(flags.pr));
  } catch (error) {
    if (!(error instanceof UsageError)) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }
    console.error(`${USAGE}: ${error.message}`);
    process.exitCode = USAGE_EXIT;
  }
}

if (isMain(import.meta.url)) main();
