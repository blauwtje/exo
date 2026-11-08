import fs from 'node:fs';
import path from 'node:path';

export const AGENT_PATH = 'agents/review-branch.md';

export const FOCUS = {
  'plan-fit': ['- Your first message Reads plan'],
  standard: ['- Report copied blocks'],
  tests: ['- A task is test-first only', '- Read `Red:` only', '- A test-first task is'],
};

const isFocusLine = (line) => Object.values(FOCUS).flat().some((prefix) => line.startsWith(prefix));

export function buildJudges(agentText) {
  const lines = agentText.split('\n');
  const body = lines.slice(lines.indexOf('---', 1) + 1);
  return Object.fromEntries(Object.entries(FOCUS).map(([name, prefixes]) => {
    const kept = body.filter((line) => !isFocusLine(line) || prefixes.some((prefix) => line.startsWith(prefix)));
    return [name, kept.join('\n')];
  }));
}

export function judgeBodies(reviewerBodies) {
  if (reviewerBodies === 'generated') return buildJudges(fs.readFileSync(path.join(import.meta.dirname, '..', AGENT_PATH), 'utf8'));
  return Object.fromEntries(Object.entries(reviewerBodies).map(([name, file]) => [name, fs.readFileSync(file, 'utf8').trim()]));
}

export const JUDGE_NAMES = ['plan-fit', 'standard', 'tests'];

export function parseReviewerBodies(value) {
  if (value === 'generated') return value;
  const pairs = (value ?? '').split(',').map((pair) => pair.split('='));
  if (pairs.some(([name, file, ...rest]) => !name || !file || rest.length > 0)) throw new Error('--reviewer-bodies needs name=file,name=file');
  if (pairs.map(([name]) => name).sort().join(',') !== JUDGE_NAMES.join(',')) throw new Error(`--reviewer-bodies needs exactly ${JUDGE_NAMES.join(', ')}`);
  return Object.fromEntries(pairs);
}
