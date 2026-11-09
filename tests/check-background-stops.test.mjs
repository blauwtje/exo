import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkBackgroundStops } from '../verify/checks/background-stops.mjs';
import { createRepository } from '../verify/repository.mjs';
import { tempDir } from './harness.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const agent = (tools, body) => `---\nname: sample\ndescription: "Sample."\ntools: ${tools}\n---\n# Sample\n\n${body}\n`;

function outcome(agents) {
  const root = tempDir('background-stops-');
  fs.mkdirSync(path.join(root, 'agents'));
  for (const [name, text] of Object.entries(agents)) fs.writeFileSync(path.join(root, 'agents', `${name}.md`), text);
  const results = [];
  checkBackgroundStops({ assert: (ok, name, pass, fail) => results.push({ ok, detail: ok ? pass : fail }) }, createRepository(root));
  return results[0];
}

test('the shipped agents all pass', () => {
  const shipped = Object.fromEntries(fs.readdirSync(path.join(ROOT, 'agents')).map((file) => [file, fs.readFileSync(path.join(ROOT, 'agents', file), 'utf8')]));
  assert.equal(outcome(Object.fromEntries(Object.entries(shipped).map(([file, text]) => [file.replace(/\.md$/, ''), text]))).ok, true);
});

test('an agent with Bash and no Monitor passes, as the wait rule is injected into its brief', () => {
  assert.equal(outcome({ shell: agent('Read, Bash', '- Run the proof.') }).ok, true);
});

test('an agent with Monitor passes only when it holds TaskStop and its body tells it to use TaskStop', () => {
  assert.equal(outcome({ stops: agent('Read, Monitor, TaskStop', 'Before returning, use TaskStop on each Monitor.') }).ok, true);
  assert.equal(outcome({ silent: agent('Read, Monitor, TaskStop', '- Run the proof.') }).ok, false);
  assert.equal(outcome({ watcher: agent('Read, Bash, Monitor', '- Start no background shell.') }).ok, false);
});

test('an agent with no Bash and no Monitor passes', () => {
  assert.equal(outcome({ reader: agent('Read, Glob', '- Read files.') }).ok, true);
});
