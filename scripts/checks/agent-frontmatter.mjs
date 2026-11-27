import { ALLOWED_EFFORT, ALLOWED_MODEL } from '#shared-values';

const AGENT_FIELDS = [
  'name', 'description', 'model', 'effort', 'maxTurns', 'autoCompactWindow', 'tools', 'disallowedTools',
  'skills', 'memory', 'background', 'omitClaudeMd', 'isolation', 'color', 'experimental'
];
const STYLE_FIELDS = ['name', 'description', 'keep-coding-instructions', 'force-for-plugin'];
const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'];
const NAME_LIMIT = 256;
const FULL_MODEL = /^claude-[\w.-]+$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const FIELD_LINE = /^(?<key>[A-Za-z][\w-]*):(?: +(?<value>.*))?$/;

function readFields(lines) {
  const closing = lines[0] === '---' ? lines.indexOf('---', 1) : -1;
  if (closing < 0) return undefined;
  const fields = new Map();
  for (const line of lines.slice(1, closing)) {
    const match = FIELD_LINE.exec(line);
    if (match) fields.set(match.groups.key, (match.groups.value ?? '').trim().replace(/^(["'])(.*)\1$/, '$2'));
  }
  return fields;
}

function unknownKeys(fields, allowed) {
  return [...fields.keys()].filter((key) => !allowed.includes(key)).map((key) => `unknown field ${key}`);
}

function identityErrors(fields) {
  const errors = [];
  for (const key of ['name', 'description']) if (!fields.get(key)) errors.push(`missing ${key}`);
  const name = fields.get('name') ?? '';
  if (name.length > NAME_LIMIT) errors.push(`name is over ${NAME_LIMIT} characters`);
  if (name.includes(':') || name.startsWith('-')) errors.push('name must not hold a colon or start with a dash');
  return errors;
}

function valueErrors(fields) {
  const errors = [];
  const model = fields.get('model');
  if (model !== undefined && !ALLOWED_MODEL.includes(model) && !FULL_MODEL.test(model)) {
    errors.push(`model must be ${ALLOWED_MODEL.join(', ')} or a claude- id`);
  }
  const effort = fields.get('effort');
  if (effort !== undefined && !ALLOWED_EFFORT.includes(effort)) errors.push(`effort must be one of ${ALLOWED_EFFORT.join(', ')}`);
  if (!COLORS.includes(fields.get('color'))) errors.push(`color must be one of ${COLORS.join(', ')}`);
  const turns = fields.get('maxTurns');
  if (turns !== undefined && !POSITIVE_INTEGER.test(turns)) errors.push('maxTurns must be a positive integer');
  return errors;
}

function fileErrors(repository, file, allowed, strict) {
  const fields = readFields(repository.lines(file));
  const relative = repository.relative(file);
  if (!fields) return [`${relative}: frontmatter must open on line 1 and close with ---`];
  const errors = [...unknownKeys(fields, allowed), ...(strict ? [...identityErrors(fields), ...valueErrors(fields)] : [])];
  return errors.map((message) => `${relative}: ${message}`);
}

function markdownIn(repository, folder) {
  return repository.walk(repository.join(folder), (full) => full.endsWith('.md'));
}

export function checkAgentFrontmatter(report, repository) {
  const errors = [
    ...markdownIn(repository, 'agents').flatMap((file) => fileErrors(repository, file, AGENT_FIELDS, true)),
    ...markdownIn(repository, 'output-styles').flatMap((file) => fileErrors(repository, file, STYLE_FIELDS, false))
  ];
  report.assert(
    errors.length === 0,
    'Agent and output style frontmatter',
    { pass: 'every agent and output style uses the documented frontmatter', fail: errors.join('; ') }
  );
}
