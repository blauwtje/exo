import fs from 'node:fs';
import path from 'node:path';
import { isFile } from '../repository.mjs';

const PROMPT_KEYS = [
  'schema_version', 'name', 'description', 'tags', 'plugins', 'runs', 'expected_outcome', 'model', 'max_turns',
  'timeout_seconds', 'allowed_tools', 'disallowed_tools', 'artifact_publish', 'growthbook_overrides',
  'append_system_prompt', 'env'
];
const CASE_KEYS = ['schema_version', 'name', 'context'];
const GRADER_TYPES = ['llm', 'baseline', 'regex', 'file_exists', 'tool_used', 'tool_order'];
const JUDGED_TYPES = ['llm', 'baseline'];
const SMOKE_TAG = 'smoke';
const FIELD_LINE = /^(?<key>[A-Za-z][\w-]*):(?: +(?<value>.*))?$/;
const SCAFFOLD_LINE = /^ +scaffold_script: *(?<value>\S+)\s*$/;

function frontmatter(lines) {
  const closing = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (closing < 0) return undefined;
  const fields = new Map();
  for (const line of lines.slice(1, closing)) {
    const match = FIELD_LINE.exec(line);
    if (match) fields.set(match.groups.key, (match.groups.value ?? '').trim().replace(/^(["'])(.*)\1$/, '$2'));
  }
  return fields;
}

function graderErrors(fields) {
  if (!fields) return ['frontmatter must open on line 1 and close with ---'];
  const type = fields.get('type');
  if (!GRADER_TYPES.includes(type)) return [`type must be one of ${GRADER_TYPES.join(', ')}`];
  const scoped = type === 'tool_used' && fields.get('tool') === 'Skill' && fields.get('max') !== '0' && !fields.has('input_match');
  return scoped ? ['a Skill grader needs max: 0 or an input_match'] : [];
}

function caseYamlErrors(folder, lines) {
  const topKeys = lines.map((line) => FIELD_LINE.exec(line)?.groups.key).filter(Boolean);
  const errors = topKeys.filter((key) => !CASE_KEYS.includes(key)).map((key) => `case.yaml has unknown key ${key}`);
  for (const line of lines) {
    const script = SCAFFOLD_LINE.exec(line)?.groups.value;
    if (script && !isFile(path.join(folder, script.replace(/^(["'])(.*)\1$/, '$2')))) {
      errors.push(`scaffold_script ${script} names no file`);
    }
  }
  return errors;
}

function caseReport(repository, folder) {
  const promptFile = path.join(folder, 'prompt.md');
  const yamlFile = path.join(folder, 'case.yaml');
  const errors = [];
  const types = [];
  let smoke = false;
  if (isFile(promptFile)) {
    const fields = frontmatter(repository.lines(promptFile));
    if (!fields) errors.push('prompt.md frontmatter must open on line 1 and close with ---');
    else {
      errors.push(...[...fields.keys()].filter((key) => !PROMPT_KEYS.includes(key)).map((key) => `prompt.md has unknown key ${key}`));
      smoke = (fields.get('tags') ?? '').replace(/^\[|\]$/g, '').split(',').some((tag) => tag.trim().replace(/^['"]|['"]$/g, '') === SMOKE_TAG);
    }
  } else errors.push('prompt.md is missing');
  if (isFile(yamlFile)) errors.push(...caseYamlErrors(folder, repository.lines(yamlFile)));
  const graders = repository.walk(path.join(folder, 'graders'), (full) => full.endsWith('.md'));
  if (graders.length === 0) errors.push('no graders/*.md file');
  for (const grader of graders) {
    const fields = frontmatter(repository.lines(grader));
    types.push(fields?.get('type'));
    errors.push(...graderErrors(fields).map((message) => `${path.basename(grader)}: ${message}`));
  }
  if (smoke && types.some((type) => JUDGED_TYPES.includes(type))) errors.push('a smoke case holds an llm or baseline grader');
  return { errors, smoke };
}

export function checkEvalCases(report, repository) {
  const root = repository.join('evals');
  const folders = fs.existsSync(root)
    ? fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => path.join(root, entry.name))
    : [];
  const cases = folders.filter((folder) => isFile(path.join(folder, 'prompt.md')) || isFile(path.join(folder, 'case.yaml')));
  const reports = cases.map((folder) => ({ folder, ...caseReport(repository, folder) }));
  const errors = reports.flatMap(({ folder, errors: found }) => found.map((message) => `${repository.relative(folder)}: ${message}`));
  if (reports.length > 0 && !reports.some((entry) => entry.smoke)) errors.push('evals: no case is tagged smoke');
  report.assert(
    errors.length === 0,
    'Eval case format',
    { pass: 'every eval case uses the documented layout and grader form', fail: errors.join('; ') }
  );
}
