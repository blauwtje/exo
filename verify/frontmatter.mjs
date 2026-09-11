// A deliberately narrow frontmatter reader: it accepts the five keys the corpus
// uses and rejects any plain scalar a YAML 1.1 and a YAML 1.2 parser would read
// differently, so a harness that disagrees with this repository cannot exist.

import { ALLOWED_EFFORT, ALLOWED_MODEL } from './budgets.mjs';

const KEY_LINE = /^(?<key>name|description|effort|model|allowed-tools): +(?<value>.+)$/;
const AMBIGUOUS_START = /^[-?:,[\]{}#&*!|>@`]/;
const AMBIGUOUS_COLON = /:\s/;
const AMBIGUOUS_COMMENT = /\s#/;
const RESERVED_SCALAR = /^(null|true|false|~|[-+]?\d+(\.\d+)?)$/i;

// Port of Get-Frontmatter (verify.ps1:89-159): opening marker on line 1, a
// closing marker, one supported key per line, no duplicates, no ambiguous scalar,
// name and description required, effort and model constrained to their sets.
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
    const match = KEY_LINE.exec(line);
    if (!match) {
      errors.push(`unsupported frontmatter line: ${line}`);
      continue;
    }
    const { key, value: valueText } = match.groups;
    if (values.has(key)) {
      errors.push(`duplicate frontmatter key: ${key}`);
      continue;
    }
    if (valueText.startsWith('"')) {
      let decoded;
      try {
        decoded = JSON.parse(valueText);
      } catch {
        errors.push(`${key} has invalid quoted YAML/JSON syntax`);
        continue;
      }
      if (typeof decoded !== 'string') {
        errors.push(`${key} must decode to a string`);
        continue;
      }
      values.set(key, decoded);
      continue;
    }
    if (AMBIGUOUS_START.test(valueText)
      || AMBIGUOUS_COLON.test(valueText)
      || AMBIGUOUS_COMMENT.test(valueText)
      || RESERVED_SCALAR.test(valueText)) {
      errors.push(`${key} uses an ambiguous plain YAML scalar`);
      continue;
    }
    values.set(key, valueText);
  }

  if (!values.has('name') || !values.has('description')) {
    errors.push('frontmatter must contain name and description');
  }
  if (values.has('effort') && !ALLOWED_EFFORT.includes(values.get('effort'))) {
    errors.push(`effort must be one of ${ALLOWED_EFFORT.join(', ')}`);
  }
  if (values.has('model') && !ALLOWED_MODEL.includes(values.get('model'))) {
    errors.push(`model must be one of ${ALLOWED_MODEL.join(', ')}`);
  }
  return { values, errors };
}
