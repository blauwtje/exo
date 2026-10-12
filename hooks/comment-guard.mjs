import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extname } from 'node:path';
import { CODE_EXTENSIONS, commentFindings } from '#code-comments';
import { isSessionId } from '#session-record-path';
import { settingValue } from '#settings-store';

export const DENY_MARKER = 'exo comment-guard:';

const STANDARD = new URL('../skills/route-skills/references/code-standard.md', import.meta.url);
const ALLOWED = 'license header; behavior forced by an external library, platform or protocol, marked `why:`; doc comment of a public API; issue or RFC link';

function guardsOn() {
  try {
    return settingValue('guards') !== 'off';
  } catch {
    return true;
  }
}

function readIfThere(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function addedLines(text, before) {
  const known = new Set(before.split('\n'));
  return text.split('\n').flatMap((line, index) => (known.has(line) ? [] : [index + 1]));
}

function changesOf(toolInput) {
  const { file_path: file, old_string: before = '', new_string: text, content, edits } = toolInput;
  if (Array.isArray(edits)) return edits.map((edit) => ({ text: edit.new_string, before: edit.old_string ?? '' }));
  if (typeof content === 'string') return [{ text: content, before: readIfThere(file) }];
  return typeof text === 'string' ? [{ text, before }] : [];
}

function findingsOf(file, changes) {
  return changes.flatMap(({ text, before }) => {
    if (typeof text !== 'string') return [];
    return commentFindings(file, addedLines(text, before), text);
  });
}

function denial(file, findings) {
  const lines = findings.map((found) => `- line ${found.line} (${found.kind}): ${found.text}`);
  return [
    `${DENY_MARKER} ${file} adds comment lines:`,
    ...lines,
    `Allowed comments: ${ALLOWED}.`,
    'Remove the comment or make the code clearer, then repeat the edit.'
  ].join('\n');
}

function standardContext(hookInput) {
  const ids = [hookInput.session_id, hookInput.agent_id ?? 'lead'];
  if (!ids.every((id) => typeof id === 'string' && isSessionId(id))) return null;
  const marker = path.join(os.tmpdir(), `exo-code-standard-${ids.join('-')}`);
  try {
    fs.writeFileSync(marker, '', { flag: 'wx' });
  } catch {
    return null;
  }
  return fs.readFileSync(STANDARD, 'utf8');
}

export function commentDecision(hookInput) {
  const toolInput = hookInput?.tool_input;
  const file = toolInput?.file_path;
  if (typeof file !== 'string' || !(extname(file).toLowerCase() in CODE_EXTENSIONS) || !guardsOn()) return null;
  const findings = findingsOf(file, changesOf(toolInput));
  if (findings.length > 0) return { permissionDecision: 'deny', permissionDecisionReason: denial(file, findings) };
  const additionalContext = standardContext(hookInput);
  return additionalContext && { additionalContext };
}
