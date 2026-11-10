import fs from 'node:fs';
import path from 'node:path';
import { readContract } from '../../harnesses/coordination-contract.mjs';

const MAX_LAYERS = 2;
const AGENT_REFERENCE = /exo:([a-z][a-z-]*)/g;

function listFiles(root, directory, suffix) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  const entries = fs.readdirSync(absolute, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function frontMatterValue(text, key) {
  const match = text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  return match ? match[1].trim() : '';
}

function readAgents(root) {
  return listFiles(root, 'agents', '.md').map((file) => {
    const text = fs.readFileSync(file, 'utf8');
    const tools = frontMatterValue(text, 'tools').split(',').map((tool) => tool.trim());
    return { name: frontMatterValue(text, 'name'), tools, text };
  });
}

function readSkills(root) {
  return listFiles(root, 'skills', 'SKILL.md').map((file) => {
    const text = fs.readFileSync(file, 'utf8');
    return { agent: frontMatterValue(text, 'agent').replace(/^exo:/, ''), text };
  });
}

function readProse(root) {
  const files = [
    ...listFiles(root, 'hooks', '.md'),
    ...listFiles(root, 'agents', '.md'),
    ...listFiles(root, 'skills', '.md')
  ];
  return files.map((file) => ({
    file: path.relative(root, file),
    text: fs.readFileSync(file, 'utf8')
  }));
}

function referencedAgents(text) {
  return [...text.matchAll(AGENT_REFERENCE)].map((match) => match[1]);
}

function dispatchEdges({ agents, skills }) {
  const names = new Set(agents.map((agent) => agent.name));
  const edges = new Map();
  for (const agent of agents) {
    if (!agent.tools.includes('Agent')) continue;
    const forkText = skills.filter((skill) => skill.agent === agent.name).map((skill) => skill.text);
    const text = [agent.text, ...forkText].join('\n');
    const targets = referencedAgents(text).filter((name) => names.has(name) && name !== agent.name);
    edges.set(agent.name, [...new Set(targets)]);
  }
  return edges;
}

function longestChain(name, edges, trail = []) {
  if (trail.includes(name)) return [...trail, name];
  const next = trail.concat(name);
  const chains = (edges.get(name) ?? []).map((target) => longestChain(target, edges, next));
  return chains.reduce((best, chain) => (chain.length > best.length ? chain : best), next);
}

function depthProblems(state) {
  const edges = dispatchEdges(state);
  const problems = [];
  for (const root of edges.keys()) {
    const chain = longestChain(root, edges);
    if (chain.length > MAX_LAYERS) {
      problems.push(`dispatch chain of ${chain.length} layers below main, above ${MAX_LAYERS}: ${chain.join(' -> ')}`);
    }
  }
  return problems;
}

function dispatchToolProblems({ agents }) {
  return agents
    .filter((agent) => agent.tools.includes('Agent') && !agent.tools.includes('SendMessage'))
    .map((agent) => `${agent.name} can dispatch but has no SendMessage tool`);
}

function contractPatterns(contract) {
  const rows = Object.values(contract).flatMap((harness) => Object.values(harness));
  const patterns = new Map();
  for (const row of rows) {
    patterns.set(`wait command ${row.wait}`, row.wait === 'wait-report' ? /wait-report\.mjs/ : null);
    patterns.set(`return cap ${row.return.maxLines}`, new RegExp(`\\b(?:at most|max|cap of) ${row.return.maxLines} lines\\b`));
    const budget = String(row.contextBudget);
    const grouped = budget.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    patterns.set(`context budget ${budget}`, new RegExp(`\\b(?:${budget}|${grouped})\\b`));
  }
  return [...patterns].filter(([, pattern]) => pattern !== null);
}

function restatementProblems({ prose, contract }) {
  const problems = [];
  for (const [label, pattern] of contractPatterns(contract)) {
    const files = prose.filter((entry) => pattern.test(entry.text)).map((entry) => entry.file);
    if (files.length > 1) problems.push(`${label} is restated in ${files.length} prose files: ${files.join(', ')}`);
  }
  return problems;
}

export function findCoordinationProblems(state) {
  return [...depthProblems(state), ...dispatchToolProblems(state), ...restatementProblems(state)];
}

export function gatherCoordinationState(root) {
  return {
    agents: readAgents(root),
    skills: readSkills(root),
    prose: readProse(root),
    contract: readContract()
  };
}

export function checkCoordinationContract(report, repository) {
  const name = 'coordination contract';
  const problems = findCoordinationProblems(gatherCoordinationState(repository.root));
  if (problems.length === 0) {
    report.result('PASS', name, 'dispatch depth and contract values are single-sourced');
    return;
  }
  for (const problem of problems) report.result('FAIL', name, problem);
}
