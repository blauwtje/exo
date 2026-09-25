// One result: verify/model-table.json names exactly the skills and agents on
// disk, each with the model and effort its own frontmatter carries, so a
// frontmatter edit that forgets the table, or a table edit that forgets the
// frontmatter, fails here instead of drifting silently. skills/configure's
// `budget` setting reads this same file to pick which agent dispatches on a
// lighter model, so a stale table would also mislead that setting.

import path from 'node:path';
import { ALLOWED_EFFORT, ALLOWED_MODEL } from '../budgets.mjs';
import { readFrontmatter } from '../frontmatter.mjs';

const MODEL_TABLE_FILE = 'verify/model-table.json';
// The agent frontmatter carries keys (tools, maxTurns) the strict skill reader
// refuses, so only its model and effort lines are read here, the way
// delegate-budget-keys.mjs reads only an agent's name line.
const MODEL_LINE = /^model: *(?<value>\S+) *$/;
const EFFORT_LINE = /^effort: *(?<value>\S+) *$/;

function agentFrontmatter(lines) {
  if (lines[0] !== '---') return { model: null, effort: null };
  const closing = lines.indexOf('---', 1);
  if (closing < 0) return { model: null, effort: null };
  let model = null;
  let effort = null;
  for (const line of lines.slice(1, closing)) {
    model = MODEL_LINE.exec(line)?.groups.value ?? model;
    effort = EFFORT_LINE.exec(line)?.groups.value ?? effort;
  }
  return { model, effort };
}

function skillFrontmatter(lines) {
  const parsed = readFrontmatter(lines);
  if (parsed.errors.length > 0) return null;
  return { model: parsed.values.get('model') ?? null, effort: parsed.values.get('effort') ?? null };
}

export function checkModelTable(report, repository) {
  const name = 'model table';
  let table;
  try {
    table = JSON.parse(repository.text(repository.join(MODEL_TABLE_FILE)));
  } catch (error) {
    report.result('FAIL', name, `${MODEL_TABLE_FILE} is not valid JSON: ${error.message}`);
    return;
  }

  const actual = new Map();
  for (const file of repository.everySkillFile()) {
    const key = `skills/${path.basename(path.dirname(file))}`;
    const entry = skillFrontmatter(repository.lines(file));
    // A skill whose frontmatter does not parse is reported by the frontmatter
    // check; this check skips it rather than failing on the same fault twice.
    if (entry !== null) actual.set(key, entry);
  }
  for (const file of repository.agentFiles()) {
    const key = `agents/${path.basename(file, '.md')}`;
    actual.set(key, agentFrontmatter(repository.lines(file)));
  }

  const problems = [];
  for (const [key, entry] of actual) {
    const row = table[key];
    if (row === undefined) {
      problems.push(`${key} is missing from ${MODEL_TABLE_FILE}`);
      continue;
    }
    if (row.model !== entry.model || row.effort !== entry.effort) {
      problems.push(`${key}: frontmatter has model=${entry.model}, effort=${entry.effort} but ${MODEL_TABLE_FILE} says model=${row.model}, effort=${row.effort}`);
    }
  }
  for (const key of Object.keys(table)) {
    if (!actual.has(key)) problems.push(`${key} in ${MODEL_TABLE_FILE} names no skill or agent on disk`);
    const row = table[key];
    if (row.model !== null && !ALLOWED_MODEL.includes(row.model)) problems.push(`${key}: model ${row.model} is not one of ${ALLOWED_MODEL.join(', ')}`);
    if (row.effort !== null && !ALLOWED_EFFORT.includes(row.effort)) problems.push(`${key}: effort ${row.effort} is not one of ${ALLOWED_EFFORT.join(', ')}`);
  }

  report.assert(
    problems.length === 0,
    name,
    `${MODEL_TABLE_FILE} names every skill and agent with its actual model and effort`,
    problems.join('; ')
  );
}
