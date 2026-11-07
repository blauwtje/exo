#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { isMain, parseFlags } from '#script-flags';
import { BUNDLE_FILE, RESULT_REF } from './ci-bundle.mjs';
import { git } from '#git';

const BASE_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$/;
const NUMBER = /^[1-9]\d{0,17}$/;

function gitOutput(root, args) {
  const done = git(root, args);
  return { ok: done.status === 0, text: `${done.stdout}${done.stderr}`.trim() };
}

export function publishPlan(root, env) {
  const { EXO_RESULT_DIR: directory, EXO_BASE: base, EXO_ISSUE: issue, EXO_RUN_ID: runId } = env;
  if (!directory || !BASE_NAME.test(base ?? '') || !NUMBER.test(issue ?? '') || !NUMBER.test(runId ?? '')) return { ok: false, text: 'refused: a publish input is missing or malformed' };
  const branch = `exo/issue-${issue}-${runId}`;
  const fetched = gitOutput(root, ['fetch', path.join(directory, BUNDLE_FILE), `${RESULT_REF}:refs/exo/incoming`]);
  if (!fetched.ok) return fetched;
  const pushed = gitOutput(root, ['push', 'origin', `refs/exo/incoming:refs/heads/${branch}`]);
  if (!pushed.ok) return pushed;
  const opened = spawnSync('gh', ['pr', 'create', '--base', base, '--head', branch, '--title', `exo: run for #${issue}`, '--body', `An exo run started from #${issue}. Review the commits before merging.`], { cwd: root, encoding: 'utf8' });
  return { ok: opened.status === 0, text: `${opened.stdout}${opened.stderr}`.trim() };
}

if (isMain(import.meta.url)) {
  parseFlags(process.argv.slice(2), {}, { usage: 'usage: EXO_RESULT_DIR EXO_BASE EXO_ISSUE EXO_RUN_ID ci-publish.mjs; pushes the bundled branch and opens the pull request' });
  const done = publishPlan(process.cwd(), process.env);
  process.stdout.write(`${done.text}\n`);
  process.exitCode = done.ok ? 0 : 1;
}
