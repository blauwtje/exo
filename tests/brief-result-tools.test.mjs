import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { agentHook } from '../hooks/agent-effort.mjs';
import { tempDir } from './harness.mjs';

const agentsRoot = fileURLToPath(new URL('../agents/', import.meta.url));

function dispatch(subagent_type, prompt, cwd) {
  const hookInput = { tool_name: 'Agent', agent_type: 'exo:orchestrator', cwd, tool_input: { subagent_type, description: 'docs', prompt } };
  return agentHook(hookInput, 'on', () => false)?.hookSpecificOutput;
}

function readerProject() {
  const cwd = tempDir('brief-result-tools-');
  fs.mkdirSync(path.join(cwd, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.claude', 'agents', 'reader.md'), '---\nname: reader\ntools: Read, Grep\n---\nbody\n');
  return cwd;
}

test('an agent without Write may answer in reply text, in either spelling', () => {
  const cwd = readerProject();
  assert.equal(dispatch('reader', 'Reads: none\nFetches: 1\nResult: reply', cwd).permissionDecision, 'allow');
  assert.equal(dispatch('reader', 'Reads: none\nFetches: 1\nResult: reply text', cwd).permissionDecision, 'allow');
});

test('an agent without Write is noted on a file result and the note names the reply form', () => {
  const output = dispatch('reader', 'Reads: none\nFetches: 1\nResult: .exo/x.md', readerProject());
  assert.equal(output.permissionDecision, 'allow');
  assert.match(output.additionalContext, /reader has no Write tool.*`Result: reply`/);
});

test('an agent with Write still needs a .exo markdown file as its result', () => {
  const general = dispatch('general-purpose', 'Reads: none\nResult: reply');
  assert.equal(general.permissionDecision, 'allow');
  assert.match(general.additionalContext, /lacks Result\b.*naming one `\.exo\/<\.\.\.>\.md` file/);
  assert.equal(dispatch('general-purpose', 'Reads: none\nResult: .exo/x.md').permissionDecision, 'allow');
});

test('a project agent is judged by the tools line of its own definition', () => {
  const cwd = tempDir('brief-result-tools-');
  fs.mkdirSync(path.join(cwd, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.claude', 'agents', 'reader.md'), '---\nname: reader\ntools: Read, Grep\n---\nbody\n');
  const reason = (result) => dispatch('reader', `Reads: none\nResult: ${result}`, cwd)?.additionalContext;
  assert.match(reason('.exo/x.md'), /reader has no Write tool.*`Result: reply`/);
});

test('every plugin agent without Write is refused a file result', () => {
  const names = fs.readdirSync(agentsRoot).filter((file) => file.endsWith('.md')).map((file) => file.slice(0, -3));
  const withoutWrite = names.filter((name) => !/^tools:.*\bWrite\b/m.test(fs.readFileSync(path.join(agentsRoot, `${name}.md`), 'utf8')));
  for (const name of withoutWrite) {
    assert.equal(dispatch(`exo:${name}`, 'Reads: none\nFetches: 1\nResult: .exo/x.md').permissionDecision, 'deny', name);
  }
});
