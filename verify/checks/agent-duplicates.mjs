import fs from 'node:fs';
import path from 'node:path';

export const SHARED_LINES_FILE = 'verify/agent-shared-lines.txt';
const CHECK_NAME = 'agent duplicate rules';
const MINIMUM_RULE_CHARS = 40;
const NOT_A_RULE = /^(?:#|```|\|)/;

function ruleLines(text) {
  const body = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const lines = body.split('\n').map((raw) => raw.trim().replace(/^(?:[-*]|\d+\.)\s+/, ''));
  return new Set(lines.filter((line) => line.length >= MINIMUM_RULE_CHARS && !NOT_A_RULE.test(line)));
}

export function sharedRuleLines(files) {
  const owners = new Map();
  for (const [name, text] of files) {
    for (const line of ruleLines(text)) owners.set(line, [...(owners.get(line) ?? []), name]);
  }
  return new Map([...owners].filter(([, names]) => names.length > 1));
}

function allowedLines(root) {
  const file = path.join(root, SHARED_LINES_FILE);
  if (!fs.existsSync(file)) return new Set();
  return new Set(fs.readFileSync(file, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean));
}

export function duplicateProblems(root, files) {
  const shared = sharedRuleLines(files);
  const allowed = allowedLines(root);
  const fresh = [...shared].filter(([line]) => !allowed.has(line)).map(([line, names]) => `"${line}" is in ${names.join(', ')}: move it to one source, a lib/guard-rules.mjs brief row for a rule every dispatch gets`);
  const stale = [...allowed].filter((line) => !shared.has(line)).map((line) => `"${line}" is no longer shared: remove it from ${SHARED_LINES_FILE}`);
  return [...fresh, ...stale];
}

export function checkAgentDuplicates(report, repository) {
  const files = repository.agentFiles().map((file) => [path.basename(file), repository.text(file)]);
  const problems = duplicateProblems(repository.root, files);
  report.assert(problems.length === 0, CHECK_NAME, `no rule line is copied across ${files.length} agents beyond ${SHARED_LINES_FILE}`, problems.join('; '));
}
