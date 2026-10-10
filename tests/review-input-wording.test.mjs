// The harness tells every subagent not to write report files and carves out
// files written as input to another tool. A reviewer told its findings file is
// "the report file" or "the deliverable" read the ban and skipped the file, so
// the wording names the file as input to the merge tool and the dispatcher
// resumes a reviewer that still returns without it.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const read = (...parts) => fs.readFileSync(path.join(repositoryRoot, ...parts), 'utf8');

const reviewer = read('agents', 'review-branch.md');
const fixer = read('agents', 'fix-review.md');
const rules = read('skills', 'verify', 'references', 'review-rules.md');
const repair = read('skills', 'verify', 'references', 'repair.md');
const runUnit = read('agents', 'run-unit.md');

test('the reviewer names its findings file as input to merge-reviews.mjs, never a report file or deliverable', () => {
  assert.match(reviewer, /merge-reviews\.mjs/, 'the reviewer names the tool that reads its file');
  assert.match(reviewer, /input to `merge-reviews\.mjs`/, 'the file is input to that tool');
  assert.doesNotMatch(reviewer, /report file|deliverable/i, 'the file is named as tool input, not as a report file or deliverable');
});

test('the fixer names its findings file as input to run-probes.mjs, not a report file', () => {
  assert.match(fixer, /input to `run-probes\.mjs`/, 'the fixer file is input to the probe tool');
  assert.doesNotMatch(fixer, /report file/i, 'the fixer file is named as tool input, not as a report file');
});

test('review-rules resumes a reviewer once by SendMessage for a missing file, then merges it BLOCKED', () => {
  assert.match(rules, /SendMessage/, 'the dispatcher resumes by SendMessage');
  assert.match(rules, /the dispatcher with SendMessage resumes it once, before any `BLOCKED` handling\.\n/, 'one resume, before BLOCKED handling');
  assert.match(rules, /input to `merge-reviews\.mjs`/, 'the resume names the path as merge tool input');
  assert.match(rules, /BLOCKED/, 'a file still missing merges as BLOCKED');
  assert.doesNotMatch(rules, /no resume, no redispatch/, 'the old blanket ban on a resume is gone for the missing-file case');
});

test('run-unit resumes its reviewers by SendMessage, the fixer turn-cap rule is unchanged and a missing fix-review.md ends the turn', () => {
  assert.doesNotMatch(rules, /without SendMessage/, 'no dispatcher is exempt from the resume');
  assert.match(runUnit.split('---')[1], /^tools: .*\bSendMessage\b/m, 'run-unit lists SendMessage in its tools');
  assert.match(runUnit, /Brief and resume per `<skill>\/\.\.\/verify\/references\/review-rules\.md`/, 'run-unit resumes a reviewer per the dispatch rules');
  assert.match(repair, /Still no file → end the turn `BLOCKED` with its report, fixes uncommitted, even when the return line reads `CLEAN`/, 'a fix-review.md still missing after the resume ends the turn');
  assert.match(rules, /Scope `fix diff` → `merge-reviews\.mjs` never reads that file/, 'merge-reviews never runs on fix-review.md');
  assert.match(repair, /no resume, no redispatch/, 'the fixer turn-cap rule stands');
});
