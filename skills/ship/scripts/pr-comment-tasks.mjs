#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { USAGE_EXIT, UsageError, parseFlags, isMain } from '#script-flags';
import { gitLine } from '#git';
import { CHILD_OUTPUT_LIMIT } from '#process-tree';
import { GH_ERROR_EXIT, GhError, PR_NUMBER, ghJson } from './gh-run.mjs';

const USAGE = 'usage: pr-comment-tasks.mjs --pr <number> --root <checkout>';
const EVIDENCE_LIMIT = 160;
const TASK_DIR = path.join('.exo', 'pr-comments');

const THREADS_QUERY = 'query($owner:String!,$name:String!,$pr:Int!){repository(owner:$owner,name:$name){pullRequest(number:$pr){reviewThreads(first:100){nodes{isResolved isOutdated comments(first:100){nodes{databaseId}}}}}}}';

function fetchThreadStates(pr) {
  const response = ghJson(['api', 'graphql', '-F', 'owner={owner}', '-F', 'name={repo}', '-F', `pr=${pr}`, '-f', `query=${THREADS_QUERY}`]);
  const threads = response.data?.repository?.pullRequest?.reviewThreads?.nodes ?? [];
  const states = new Map();
  for (const thread of threads) {
    for (const { databaseId } of thread.comments?.nodes ?? []) {
      states.set(databaseId, { resolved: thread.isResolved === true, outdated: thread.isOutdated === true });
    }
  }
  return states;
}

function skipReason(comment, state) {
  if (comment.user?.type === 'Bot') return 'bot';
  if (comment.in_reply_to_id) return 'reply';
  if (state?.resolved) return 'resolved';
  if (state?.outdated || (typeof comment.path === 'string' && comment.line === null && Number.isInteger(comment.original_line))) return 'outdated';
  if (typeof comment.path !== 'string' || !Number.isInteger(comment.line)) return 'no file and line';
  if (/\s/.test(comment.path)) return 'path with whitespace';
  return null;
}

function lineAtHead(root, file, line) {
  const shown = gitLine(root, ['show', `HEAD:${file}`], { trim: false, maxBuffer: CHILD_OUTPUT_LIMIT });
  if (shown === null) return null;
  return shown.split('\n')[line - 1]?.trim() || null;
}

function evidenceOf(body) {
  return String(body ?? '').replace(/[;\s]+/g, ' ').trim().slice(0, EVIDENCE_LIMIT);
}

const shellQuoted = (text) => `'${text.replaceAll("'", "'\\''")}'`;

function findingFor(comment, quote) {
  return [
    `${comment.path}:${comment.line}; defect; reviewer comment; ${evidenceOf(comment.body)}; fix`,
    `  Probe: ! grep -qF -e ${shellQuoted(quote)} ${shellQuoted(comment.path)}`,
    '  Class: reviewer comment',
    `  Sweep: grep -nF -e ${shellQuoted(quote)} ${shellQuoted(comment.path)}`,
    `  Quote: ${quote}`,
    ''
  ].join('\n');
}

function planTasks(comments, threadStates, { root, pr }) {
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
  const flags = parseFlags(argv, { pr: 'value', root: 'value' }, { usage: USAGE });
  if (!PR_NUMBER.test(flags.pr ?? '')) throw new UsageError(`--pr needs a pull request number, got '${flags.pr ?? ''}'`);
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
    process.exitCode = USAGE_EXIT;
    return;
  }
  try {
    const root = path.resolve(flags.root);
    const { tasks, skipped } = planTasks(ghJson(['api', `repos/{owner}/{repo}/pulls/${flags.pr}/comments`, '--paginate', '--slurp']).flat(), fetchThreadStates(flags.pr), { root, pr: flags.pr });
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
