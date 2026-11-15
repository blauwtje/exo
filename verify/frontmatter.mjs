const ALLOWED_EFFORT = ['low', 'medium', 'high', 'xhigh', 'max'];
const ALLOWED_MODEL = ['sonnet', 'opus', 'haiku', 'fable', 'inherit'];

const KEY_LINE = /^(?<key>name|description|effort|model|allowed-tools|argument-hint|disable-model-invocation|shell|license|compatibility|user-invocable|disallowed-tools|context|agent): +(?<value>.+)$/;
const BOOLEAN_KEYS = ['disable-model-invocation', 'user-invocable'];
const AMBIGUOUS_START = /^[-?:,[\]{}#&*!|>@`]/;
const AMBIGUOUS_COLON = /:\s/;
const AMBIGUOUS_COMMENT = /\s#/;
const RESERVED_SCALAR = /^(null|true|false|~|[-+]?\d+(\.\d+)?)$/i;

function parseValue(key, valueText) {
  if (BOOLEAN_KEYS.includes(key)) {
    return valueText === 'true' || valueText === 'false' ? { value: valueText } : { error: `${key} must be true or false` };
  }
  if (valueText.startsWith('"')) return parseQuoted(key, valueText);
  const ambiguous = AMBIGUOUS_START.test(valueText)
    || AMBIGUOUS_COLON.test(valueText)
    || AMBIGUOUS_COMMENT.test(valueText)
    || RESERVED_SCALAR.test(valueText);
  return ambiguous ? { error: `${key} uses an ambiguous plain YAML scalar` } : { value: valueText };
}

function parseQuoted(key, valueText) {
  let decoded;
  try {
    decoded = JSON.parse(valueText);
  } catch {
    return { error: `${key} has invalid quoted YAML/JSON syntax` };
  }
  return typeof decoded === 'string' ? { value: decoded } : { error: `${key} must decode to a string` };
}

function parseLine(line, values) {
  const match = KEY_LINE.exec(line);
  if (!match) return { error: `unsupported frontmatter line: ${line}` };
  const { key, value } = match.groups;
  if (values.has(key)) return { error: `duplicate frontmatter key: ${key}` };
  return { key, ...parseValue(key, value) };
}

function schemaErrors(values) {
  const errors = [];
  if (!values.has('name') || !values.has('description')) errors.push('frontmatter must contain name and description');
  if (values.has('effort') && !ALLOWED_EFFORT.includes(values.get('effort'))) {
    errors.push(`effort must be one of ${ALLOWED_EFFORT.join(', ')}`);
  }
  if (values.has('model') && !ALLOWED_MODEL.includes(values.get('model'))) {
    errors.push(`model must be one of ${ALLOWED_MODEL.join(', ')}`);
  }
  return errors;
}

export function readFrontmatter(lines) {
  const values = new Map();
  const errors = [];

  if (lines.length < 4 || lines[0] !== '---') {
    errors.push('frontmatter must start on line 1');
    return { values, errors };
  }

  const closing = lines.indexOf('---', 1);
  if (closing < 0) {
    errors.push('frontmatter closing marker is missing');
    return { values, errors };
  }

  for (const line of lines.slice(1, closing)) {
    const parsed = parseLine(line, values);
    if (parsed.error) errors.push(parsed.error);
    else values.set(parsed.key, parsed.value);
  }
  errors.push(...schemaErrors(values));
  return { values, errors };
}
