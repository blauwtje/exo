import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreStream } from '../benchmarks/lead-delegation.mjs';

const call = (name, input, parent = null) => ({
  type: 'assistant',
  parent_tool_use_id: parent,
  message: { content: [{ type: 'tool_use', id: `${name}-${JSON.stringify(input)}`, name, input }] }
});
const write = (file, parent) => call('Write', { file_path: file }, parent);

test('three lead writes and no agent fails', () => {
  const score = scoreStream([write('/p/a.css'), write('/p/b.css'), write('/p/c.js')]);
  assert.equal(score.agents, 0);
  assert.equal(score.writes, 3);
  assert.equal(score.pass, false);
});

test('one agent, two lead writes and five subagent writes passes', () => {
  const subagent = ['a', 'b', 'c', 'd', 'e'].map((name) => write(`/p/${name}.js`, 'agent-1'));
  const score = scoreStream([call('Agent', { prompt: 'x' }), write('/p/a.css'), write('/p/b.css'), ...subagent]);
  assert.equal(score.agents, 1);
  assert.equal(score.writes, 2);
  assert.equal(score.pass, true);
});

test('a .exo write is not counted', () => {
  const score = scoreStream([call('Agent', {}), write('/p/.exo/brief.md'), write('/p/a.css')]);
  assert.equal(score.writes, 1);
});

test('three product files changed through lead Bash count as writes', () => {
  const bash = (...files) => ({ type: 'lead_bash_write', files });
  const score = scoreStream([call('Agent', {}), bash('/p/a.css'), bash('/p/b.css', '/p/c.js'), bash('/p/a.css')]);
  assert.equal(score.writes, 3);
  assert.equal(score.pass, false);
});
