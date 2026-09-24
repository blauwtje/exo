// The delegate budget hook looks up its per-agent override by the hook input's
// `agent_type`, which Claude Code sends as `exo:<name>` for a plugin agent. A key
// that names no real agent type matches nothing, so its override never applies.

import fs from 'node:fs';
import path from 'node:path';

const BUDGETS_FILE = 'skills/savings/assets/delegate-budgets.json';
const PLUGIN_PREFIX = 'exo:';
const BUILT_IN_AGENT_TYPES = ['Explore', 'general-purpose', 'Plan'];
const NAME_LINE = /^name: *(?<name>\S+) *$/;

// The agent frontmatter carries keys the skill frontmatter reader refuses, so
// only its `name` line is read here.
function agentFrontmatterName(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  if (lines[0] !== '---') return null;
  const closing = lines.indexOf('---', 1);
  if (closing < 0) return null;
  for (const line of lines.slice(1, closing)) {
    const match = NAME_LINE.exec(line);
    if (match) return match.groups.name;
  }
  return null;
}

function keyProblem(key, agentNames) {
  if (BUILT_IN_AGENT_TYPES.includes(key)) return null;
  if (key.startsWith(PLUGIN_PREFIX)) {
    const name = key.slice(PLUGIN_PREFIX.length);
    return agentNames.has(name) ? null : `${key} names no agents/${name}.md with name: ${name}`;
  }
  if (agentNames.has(key)) return `${key} lacks the plugin prefix: key it as ${PLUGIN_PREFIX}${key}`;
  return `${key} is neither ${PLUGIN_PREFIX}<agent> nor a built-in type (${BUILT_IN_AGENT_TYPES.join(', ')})`;
}

export function checkDelegateBudgetKeys(report, repository) {
  const name = 'delegate budget keys';
  const budgetsFile = repository.join(BUDGETS_FILE);
  if (!fs.existsSync(budgetsFile)) {
    report.result('UNRUN', name, `${BUDGETS_FILE} does not exist`);
    return;
  }

  let budgets;
  try {
    budgets = JSON.parse(repository.text(budgetsFile));
  } catch (error) {
    report.result('FAIL', name, `${BUDGETS_FILE} is not valid JSON: ${error.message}`);
    return;
  }

  const agentNames = new Set();
  for (const file of repository.agentFiles()) {
    const declared = agentFrontmatterName(file);
    if (declared === path.basename(file, '.md')) agentNames.add(declared);
  }

  const keys = Object.keys(budgets.agents ?? {});
  const problems = keys.map((key) => keyProblem(key, agentNames)).filter((problem) => problem !== null);
  report.assert(
    problems.length === 0,
    name,
    `all ${keys.length} agent overrides in ${BUDGETS_FILE} name a real agent_type`,
    problems.join('; ')
  );
}
