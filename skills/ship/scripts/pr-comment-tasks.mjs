#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { UsageError, parseFlags, isMain } from '#script-flags';

export const GH_ERROR_EXIT = 3;
const USAGE = 'usage: pr-comment-tasks.mjs --pr <number> --root <checkout> [--repo <owner/repo>]';
const PR_NUMBER = /^[1-9][0-9]*$/;
const EVIDENCE_LIMIT = 160;
const TASK_DIR = path.join('.exo', 'pr-comments');

class GhError extends Error {}

const THREADS_QUERY = 'query($owner:String!,$name:String!,$pr:Int!){repository(owner:$owner,name:$name){pullRequest(number:$pr){reviewThreads(first:100){nodes{isResolved isOutdated comments(first:100){nodes{databaseId}}}}}}}';

function ghJson(args) {
  try {
    return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (error) {
    const errorText = `${error.stderr ?? ''}`.trim() || error.message;
    throw new GhError((errorText.split('\n').find((line) => line.trim() !== '') ?? 'no output').trim());
  }
}

function fetchComments(pr, repo) {
  const slug = repo ?? '{owner}/{repo}';
  return ghJson(['api', `repos/${slug}/pulls/${pr}/comments`, '--paginate', '--slurp']).flat();
}

function fetchThreadStates(pr, repo) {
  const [owner, name] = (repo ?? '{owner}/{repo}').split('/');
  const response = ghJson(['api', 'graphql', '-F', `owner=${owner}`, '-F', `name=${name}`, '-F', `pr=${pr}`, '-f', `query=${THREADS_QUERY}`]);
  const threads = response.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
  const states = new Map();
  for (const thread of threads) {
    for (const { databaseId } of thread.comments?.nodes ?? []) {
      states.set(databaseId, { resolved: thread.isResolved === true, outdated: thread.isOutdated === true });
    }
  }
  return states;
}

function isOutdated(comment, state) {
  if (state?.outdated) return true;
  return typeof comment.path === 'string' && comment.line === null && Number.isInteger(comment.original_line);
}

function skipReason(comment, state) {
  if (comment.user?.type === 'Bot') return 'bot';
  if (comment.in_reply_to_id) return 'reply';
  if (state?.resolved) return 'resolved';
  if (isOutdated(comment, state)) return 'outdated';
  if (typeof comment.path !== 'string' || !Number.isInteger(comment.line)) return 'no file and line';
  if (/\s/.test(comment.path)) return 'path with whitespace';
  return null;
}

function lineAtHead(root, file, line) {
  const shown = spawnSync('git', ['-C', root, 'show', `HEAD:${file}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (shown.status !== 0) return null;
  return shown.stdout.split('\n')[line - 1]?.trim() || null;
}

function evidenceOf(body) {
  return String(body ?? '').replace(/[;\s]+/g, ' ').trim().slice(0, EVIDENCE_LIMIT);
}

const shellQuoted = (text) => `'${text.replaceAll("'", "'\\''")}'`;

export function findingFor(comment, quote) {
  return [
    `${comment.path}:${comment.line}; defect; reviewer comment; ${evidenceOf(comment.body)}; fix`,
    `  Probe: ! grep -qF -e ${shellQuoted(quote)} ${shellQuoted(comment.path)}`,
    '  Class: reviewer comment',
    `  Sweep: grep -nF -e ${shellQuoted(quote)} ${shellQuoted(comment.path)}`,
    `  Quote: ${quote}`,
    ''
  ].join('\n');
}

export function planTasks(comments, root, pr, threadStates = new Map()) {
  const tasks = [];
  const skipped = [];
  for (const comment of comments) {
    const reason = skipReason(comment, threadStates.get(comment.id));
    if (reason !== null) {
      skipped.push({ id: comment.id, reason });
      continue;
    }
    const quote = lineAtHead(root, comment.path, comment.line);
    if (quote === null) {
      skipped.push({ id: comment.id, reason: 'line absent at HEAD' });
      continue;
    }
    tasks.push({
      id: comment.id,
      target: `${comment.path}:${comment.line}`,
      file: path.join(root, TASK_DIR, `${pr}-${comment.id}.md`),
      text: `FINDINGS\n\n${findingFor(comment, quote)}`
    });
  }
  return { tasks, skipped };
}

function readFlags(argv) {
  const flags = parseFlags(argv, { pr: 'value', root: 'value', repo: 'value' }, { usage: USAGE });
  if (!PR_NUMBER.test(flags.pr ?? '')) throw new UsageError('--pr needs a pull request number');
  if (!flags.root) throw new UsageError('--root needs a checkout');
  return flags;
}

function main() {
  let flags;
  try {
    flags = readFlags(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`${USAGE}: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  try {
    const root = path.resolve(flags.root);
    const { tasks, skipped } = planTasks(fetchComments(flags.pr, flags.repo), root, flags.pr, fetchThreadStates(flags.pr, flags.repo));
    fs.mkdirSync(path.join(root, TASK_DIR), { recursive: true });
    for (const task of tasks) {
      fs.writeFileSync(task.file, task.text);
      console.log(`TASK ${task.id} ${task.target} findings=${task.file}`);
    }
    for (const { id, reason } of skipped) console.log(`SKIP ${id} ${reason}`);
    console.log(`TASKS ${tasks.length} SKIPPED ${skipped.length}`);
  } catch (error) {
    if (!(error instanceof GhError)) throw error;
    console.log(`STOP gh=${error.message}`);
    process.exitCode = GH_ERROR_EXIT;
  }
}

if (isMain(import.meta.url)) {
  main();
}
