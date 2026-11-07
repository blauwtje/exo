import fs from 'node:fs';
import path from 'node:path';

export const AGENT_PATH = 'agents/review-branch.md';
export const JUDGE_DIR = 'benchmarks/review-judges';

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

export function judgePath(name) {
  return `${JUDGE_DIR}/${name}.md`;
}

export function writeJudges(root) {
  const judges = buildJudges(fs.readFileSync(path.join(root, AGENT_PATH), 'utf8'));
  for (const [name, text] of Object.entries(judges)) fs.writeFileSync(path.join(root, judgePath(name)), text);
}
