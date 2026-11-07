import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { splitFrontmatter } from '../../harnesses/codex/rules.mjs';
import { readFrontmatter } from '../frontmatter.mjs';
import { SESSION_LOAD_LOCK, SESSION_START_BYTES_LOCK } from '../budgets.mjs';

const words = (text) => text.split(/\s+/).filter((word) => word !== '').length;

function sessionStartWords(repository) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-session-load-'));
  try {
    const env = { ...process.env, HOME: scratch, USERPROFILE: scratch };
    for (const name of ['CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'EXO_HOST', 'EXO_RUN', 'EXO_RUN_DIR']) delete env[name];
    const run = spawnSync(process.execPath, [repository.join('hooks', 'session-start.mjs')], {
      env, input: JSON.stringify({ cwd: scratch, source: 'startup' }), encoding: 'utf8'
    });
    if (run.status !== 0) return { error: `hooks/session-start.mjs exited ${run.status}` };
    const context = JSON.parse(run.stdout).hookSpecificOutput.additionalContext;
    return { count: words(context), bytes: Buffer.byteLength(context, 'utf8') };
  } catch (error) {
    return { error: `hooks/session-start.mjs output unreadable, ${error.message}` };
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

export function checkSessionLoad(report, repository) {
  const start = sessionStartWords(repository);
  if (start.error) {
    report.result('UNRUN', 'session load', start.error);
    return;
  }
  let skills = 0;
  for (const file of repository.everySkillFile()) {
    const parsed = readFrontmatter(repository.lines(file));
    if (parsed.errors.length > 0) {
      report.result('UNRUN', 'session load', `count blocked by unparsed frontmatter in ${repository.relative(file)}`);
      return;
    }
    if (parsed.values.get('disable-model-invocation') === 'true') continue;
    skills += words(`${parsed.values.get('name') ?? path.basename(path.dirname(file))} ${parsed.values.get('description') ?? ''}`);
  }
  let agents = 0;
  for (const file of repository.agentFiles()) {
    const { fields } = splitFrontmatter(fs.readFileSync(file, 'utf8'));
    if (fields === null) {
      report.result('UNRUN', 'session load', `count blocked by unparsed frontmatter in ${repository.relative(file)}`);
      return;
    }
    agents += words(`${fields.name ?? path.basename(file, '.md')} ${fields.description ?? ''}`);
  }
  if (start.bytes > SESSION_START_BYTES_LOCK.bytes) {
    report.result('FAIL', 'session load', `hooks/session-start.mjs injects ${start.bytes} bytes, over the ${SESSION_START_BYTES_LOCK.bytes} locked on ${SESSION_START_BYTES_LOCK.measured}; cut the text, or raise the lock in verify/budgets.mjs in the commit that pays for it`);
    return;
  }
  const total = start.count + skills + agents;
  const parts = `${start.count} session start + ${skills} skills + ${agents} agents`;
  if (total > SESSION_LOAD_LOCK.words) {
    report.result('FAIL', 'session load', `every session loads ${total} words (${parts}), over the ${SESSION_LOAD_LOCK.words} locked on ${SESSION_LOAD_LOCK.measured}; cut the text, or raise the lock in verify/budgets.mjs in the commit that pays for it`);
    return;
  }
  report.result('PASS', 'session load', `every session loads ${total} words (${parts}) against the ${SESSION_LOAD_LOCK.words} locked on ${SESSION_LOAD_LOCK.measured}`);
}
