import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readFrontmatter } from '../verify/frontmatter.mjs';
import { hookAgentType } from './context-limits.mjs';

const CHECKED_AGENTS = new Set(['build-task', 'fix-review']);
const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit']);
const SCRIPT_EXTENSIONS = new Set(['.mjs', '.js', '.cjs']);
const NODE_CHECK_TIMEOUT_MS = 10000;
const REASON_LINES = 6;

function applyEdit(text, edit) {
  if (typeof edit?.old_string !== 'string' || typeof edit.new_string !== 'string') return null;
  if (edit.old_string === '' || !text.includes(edit.old_string)) return null;
  if (edit.replace_all === true) return text.split(edit.old_string).join(edit.new_string);
  const at = text.indexOf(edit.old_string);
  return text.slice(0, at) + edit.new_string + text.slice(at + edit.old_string.length);
}

function applyEdits(file, edits) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  for (const edit of edits) {
    text = applyEdit(text, edit);
    if (text === null) return null;
  }
  return text;
}

export function postEditText(hookInput) {
  const toolInput = hookInput.tool_input ?? {};
  const file = toolInput.file_path;
  if (typeof file !== 'string') return null;
  const absolute = path.resolve(hookInput.cwd ?? '.', file);
  if (hookInput.tool_name === 'Write') return typeof toolInput.content === 'string' ? toolInput.content : null;
  if (hookInput.tool_name === 'Edit') return applyEdits(absolute, [toolInput]);
  if (hookInput.tool_name === 'MultiEdit' && Array.isArray(toolInput.edits)) return applyEdits(absolute, toolInput.edits);
  return null;
}

function scriptError(text, extension) {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-syntax-'));
  const copy = path.join(folder, `check${extension}`);
  try {
    fs.writeFileSync(copy, text);
    const run = spawnSync(process.execPath, ['--check', copy], { encoding: 'utf8', timeout: NODE_CHECK_TIMEOUT_MS, stdio: ['ignore', 'ignore', 'pipe'] });
    if (run.status === 0 || run.status === null) return null;
    return run.stderr.split(copy).join('the edited file').split('\n').slice(0, REASON_LINES).join('\n').trim();
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

function jsonError(text) {
  try {
    JSON.parse(text);
    return null;
  } catch (error) {
    return error.message;
  }
}

function frontmatterError(text) {
  const { errors } = readFrontmatter(text.split('\n'));
  return errors.length === 0 ? null : errors.join('; ');
}

const hasFrontmatter = (relative) => path.basename(relative) === 'SKILL.md' || (relative.endsWith('.md') && relative.split(path.sep).includes('agents'));

function parseError(text, relative) {
  const extension = path.extname(relative).toLowerCase();
  if (SCRIPT_EXTENSIONS.has(extension)) return scriptError(text, extension);
  if (extension === '.json') return jsonError(text);
  if (hasFrontmatter(relative)) return frontmatterError(text);
  return null;
}

export function syntaxFields(hookInput) {
  if (!hookInput || !EDIT_TOOLS.has(hookInput.tool_name)) return null;
  if (!CHECKED_AGENTS.has(hookAgentType(hookInput))) return null;
  const text = postEditText(hookInput);
  if (text === null) return null;
  const relative = path.relative(hookInput.cwd ?? '.', path.resolve(hookInput.cwd ?? '.', hookInput.tool_input.file_path));
  const error = parseError(text, relative);
  if (error === null) return null;
  return { permissionDecision: 'deny', permissionDecisionReason: `${relative} would not parse after this edit, so it was not changed: ${error}` };
}
