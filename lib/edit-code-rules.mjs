import fs from 'node:fs';
import path from 'node:path';
import { denyReason } from './guard-rules.mjs';
import { codeRuleRefusal, isCodeRulePath, textRuleFindings } from '#code-rules';
import { commentSpans } from '#code-comments';
import { addedLineNumbers } from './added-lines.mjs';

function currentText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function applyEdit(text, edit) {
  if (text === null || typeof edit?.old_string !== 'string' || typeof edit.new_string !== 'string') return null;
  if (!text.includes(edit.old_string)) return null;
  if (edit.replace_all) return text.replaceAll(edit.old_string, () => edit.new_string);
  return text.replace(edit.old_string, () => edit.new_string);
}

function resultingText(toolName, input, before) {
  if (toolName === 'Write') return typeof input.content === 'string' ? input.content : null;
  if (toolName === 'Edit') return applyEdit(before, input);
  if (toolName === 'MultiEdit' && Array.isArray(input.edits)) return input.edits.reduce(applyEdit, before);
  return null;
}

function displayPath(file, cwd) {
  const relative = cwd ? path.relative(cwd, file) : file;
  return relative.startsWith('..') || path.isAbsolute(relative) ? file : relative;
}

function onlyCommentFails(fails) {
  return fails.every((fail) => fail.split(' ')[1] === 'comment');
}

function blankSpans(text, spans) {
  let result = '';
  let position = 0;
  for (const span of spans) {
    result += text.slice(position, span.from) + text.slice(span.from, span.to).replace(/[^\n]/g, '');
    position = span.to;
  }
  return result + text.slice(position);
}

const KEPT_DIRECTIVE = /shellcheck|shfmt|eslint|prettier|stylelint|tslint|jshint|jscs|@ts-|noqa|flake8|pylint|mypy|type:\s*ignore|nolint|biome|istanbul|c8 |rubocop|pragma|go:|\+build|<reference|coding[:=]|spdx|copyright|licen[sc]e/i;

function touchedLines(spans) {
  return new Set(spans.flatMap((span) => Array.from({ length: span.end - span.start + 1 }, (_, offset) => span.start + offset)));
}

function strippedWrite(file, before, after) {
  const added = new Set(addedLineNumbers(before, after));
  const spans = commentSpans(file, after).filter((span) => !span.allowed && added.has(span.start) && !KEPT_DIRECTIVE.test(after.slice(span.from, span.to)));
  if (spans.length === 0) return null;
  const touched = touchedLines(spans);
  const original = after.split('\n');
  return blankSpans(after, spans)
    .split('\n')
    .map((line, index) => {
      if (!touched.has(index + 1)) return line;
      return line.trim() === '' && original[index].trim() !== '' ? null : line.trimEnd();
    })
    .filter((line) => line !== null)
    .join('\n');
}

function writeRewrite(hookInput, file, before, after) {
  const stripped = strippedWrite(displayPath(file, hookInput.cwd), before, after);
  if (stripped === null) return null;
  const { fails } = textRuleFindings({ path: displayPath(file, hookInput.cwd), before, after: stripped });
  if (!fails.every((fail) => KEPT_DIRECTIVE.test(fail))) return null;
  return { updatedInput: { ...hookInput.tool_input, content: stripped } };
}

export function editRuleFields(hookInput) {
  const input = hookInput?.tool_input;
  const file = input?.file_path;
  if (typeof file !== 'string' || !isCodeRulePath(file)) return null;
  const before = currentText(file);
  const after = resultingText(hookInput.tool_name, input, before);
  if (after === null) return null;
  const { fails } = textRuleFindings({ path: displayPath(file, hookInput.cwd), before, after });
  if (fails.length === 0) return null;
  const rewrite = hookInput.tool_name === 'Write' && onlyCommentFails(fails) ? writeRewrite(hookInput, file, before, after) : null;
  if (rewrite) return rewrite;
  return { permissionDecision: 'deny', permissionDecisionReason: denyReason('code-rules', codeRuleRefusal(fails)) };
}
