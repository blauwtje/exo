import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { findDuplicates } from '../skills/file-issues/scripts/find-duplicates.mjs';

const NOW = Date.parse('2026-11-06T00:00:00Z');
const issues = [
  { number: 7, title: 'Export the report as CSV', state: 'OPEN', url: 'https://example.com/7', closedAt: null },
  { number: 8, title: 'Export report to CSV file', state: 'CLOSED', url: 'https://example.com/8', closedAt: '2026-10-20T00:00:00Z' },
  { number: 9, title: 'Export report as CSV long ago', state: 'CLOSED', url: 'https://example.com/9', closedAt: '2025-01-01T00:00:00Z' },
  { number: 10, title: 'Fix the login page colors', state: 'OPEN', url: 'https://example.com/10', closedAt: null }
];

function fakeGh(calls) {
  return (args) => {
    calls.push(args);
    return JSON.stringify(issues);
  };
}

test('a draft matching open and recently closed issues lists them with a reason', () => {
  const calls = [];
  const [result] = findDuplicates(['Export the report as a CSV file'], { run: fakeGh(calls), now: NOW });
  assert.deepEqual(result.matches.map((match) => match.number).sort(), [7, 8]);
  assert.match(result.matches[0].reason, /shares \d+ title words/);
  assert.equal(result.matches.find((match) => match.number === 8).state, 'closed');
});

test('a closed issue older than the window is not listed', () => {
  const [result] = findDuplicates(['Export the report as a CSV file'], { run: fakeGh([]), now: NOW });
  assert.ok(!result.matches.some((match) => match.number === 9));
});

test('a draft with no similar issue has no matches', () => {
  const [result] = findDuplicates(['Add dark mode to the settings screen'], { run: fakeGh([]), now: NOW });
  assert.deepEqual(result.matches, []);
});

test('the search is read-only and runs once per draft', () => {
  const calls = [];
  findDuplicates(['Export the report as a CSV file', 'Fix login page colors'], { run: fakeGh(calls), now: NOW });
  assert.equal(calls.length, 2);
  for (const args of calls) assert.deepEqual(args.slice(0, 2), ['issue', 'list']);
});

test('file-issues runs the duplicate search before creating and may not edit the match', () => {
  const skill = fs.readFileSync(new URL('../skills/file-issues/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /find-duplicates\.mjs/);
  assert.match(skill, /link or file/);
});
