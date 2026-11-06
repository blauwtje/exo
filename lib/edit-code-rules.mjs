import fs from 'node:fs';
import path from 'node:path';
import { denyReason } from './guard-rules.mjs';
import { codeRuleRefusal, isCodeRulePath, textRuleFindings } from '#code-rules';

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

export function editRuleFields(hookInput) {
  const input = hookInput?.tool_input;
  const file = input?.file_path;
  if (typeof file !== 'string' || !isCodeRulePath(file)) return null;
  const before = currentText(file);
  const after = resultingText(hookInput.tool_name, input, before);
  if (after === null) return null;
  const { fails } = textRuleFindings({ path: displayPath(file, hookInput.cwd), before, after });
  if (fails.length === 0) return null;
  return { permissionDecision: 'deny', permissionDecisionReason: denyReason('code-rules', codeRuleRefusal(fails)) };
}
