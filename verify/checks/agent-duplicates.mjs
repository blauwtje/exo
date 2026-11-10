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

function sharedInChains(chains) {
  const shared = new Map();
  for (const files of chains) {
    for (const [line, names] of sharedRuleLines(files)) shared.set(line, [...(shared.get(line) ?? []), ...names]);
  }
  return shared;
}

function allowedLines(root) {
  const file = path.join(root, SHARED_LINES_FILE);
  if (!fs.existsSync(file)) return new Set();
  return new Set(fs.readFileSync(file, 'utf8').split('\n').map((line) => line.trim()).filter(Boolean));
}

export function duplicateProblems(root, chains) {
  const shared = sharedInChains(chains);
  const allowed = allowedLines(root);
  const fresh = [...shared].filter(([line]) => !allowed.has(line)).map(([line, names]) => `"${line}" is in ${names.join(', ')}: move it to one source, a lib/guard-rules.mjs brief row for a rule every dispatch gets`);
  const stale = [...allowed].filter((line) => !shared.has(line)).map((line) => `"${line}" is no longer shared: remove it from ${SHARED_LINES_FILE}`);
  return [...fresh, ...stale];
}

function markdownIn(repository, ...segments) {
  const directory = repository.join(...segments);
  if (!fs.existsSync(directory)) return [];
  return repository.walk(directory, (full) => full.endsWith('.md'));
}

export function loadChains(repository) {
  const named = (files) => files.map((file) => [repository.relative(file), repository.text(file)]);
  const sharedReferences = [...markdownIn(repository, 'lib', 'references'), ...markdownIn(repository, 'lib', 'agent-modes')];
  const skillChains = repository.skillDirectories().map((skill) => named(markdownIn(repository, 'skills', skill)));
  const agentChains = repository.agentFiles().map((file) => named([file, ...sharedReferences]));
  const hookChain = named(markdownIn(repository, 'hooks'));
  return [...skillChains, ...agentChains, hookChain];
}

export function checkAgentDuplicates(report, repository) {
  const chains = loadChains(repository);
  const problems = duplicateProblems(repository.root, chains);
  report.assert(problems.length === 0, CHECK_NAME, `no rule line is repeated inside one of ${chains.length} load chains beyond ${SHARED_LINES_FILE}`, problems.join('; '));
}
