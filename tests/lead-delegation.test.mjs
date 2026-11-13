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

const result = (extra = {}) => ({ type: 'result', total_cost_usd: 0.5, permission_denials: [], ...extra });
const withId = (id, name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id, name, input }] } });

const bash = (id, file) => ({ type: 'lead_bash_write', tool_use_id: id, files: [file] });

test('a history stream scores only turn 2, with bash writes placed by tool_use_id', () => {
  const score = scoreStream([
    call('Read', { file_path: '/p/a.css' }), result(),
    call('Agent', {}), write('/p/a.css'), write('/p/b.css'), withId('b2', 'Bash', {}), result(),
    bash('b2', '/p/d.css')
  ]);
  assert.equal(score.agents, 1);
  assert.equal(score.writes, 3);
  assert.equal(score.pass, false);
  assert.equal(score.void, false);
});

test('a history stream with a product file written in turn 1 is void', () => {
  const written = scoreStream([write('/p/a.css'), result(), call('Agent', {}), result()]);
  const bashed = scoreStream([withId('b1', 'Bash', {}), result(), call('Agent', {}), result(), bash('b1', '/p/a.css')]);
  assert.equal(written.void, true);
  assert.equal(bashed.void, true);
});

test('a session that died on an API error or never produced a result is void', () => {
  const errored = scoreStream([call('Read', {}), result({ is_error: true, api_error_status: 403, total_cost_usd: 0 })]);
  assert.equal(errored.void, true);
  assert.equal(scoreStream([call('Read', {})]).void, true);
});

test('a history stream whose build turn starts under 50,000 context tokens is void', () => {
  const sized = (tokens) => ({ type: 'assistant', message: { usage: { input_tokens: tokens }, content: [{ type: 'tool_use', id: 'a1', name: 'Agent', input: {} }] } });
  assert.equal(scoreStream([call('Read', {}), result(), sized(19_500), result()]).void, true);
  assert.equal(scoreStream([call('Read', {}), result(), sized(60_000), result()]).void, false);
});
