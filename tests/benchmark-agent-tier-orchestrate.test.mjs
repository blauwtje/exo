import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { readKindTable } from '#model-kinds';
import { planJobs, resolveFixtures } from '../benchmarks/agent-tier.mjs';
import { RESULT_FILE, ownedLines, partPhase, partVerdict, resultFindings } from '../benchmarks/agent-tier/orchestrate/grade.mjs';
import { mainMessages, partOf, transcriptChecks, transcriptFindings } from '../benchmarks/agent-tier/orchestrate/transcript.mjs';
import { loadValueTasks, prepareValueRepo, scoreValueRepo } from '../benchmarks/value.mjs';

const ORCHESTRATE_ROOT = path.join(import.meta.dirname, '..', 'benchmarks', 'agent-tier', 'orchestrate');
const IDS = ['slugify', 'clamp', 'report-format'];
const PARTS = { parts: { slugify: 'DONE', clamp: 'DONE', 'report-format': 'DONE' }, together: [['slugify', 'clamp']], after: [['report-format', 'slugify']] };

test('ownedLines gives a line to the first part it names and a phase heading to every part it names', () => {
  const text = '## Phase 1: slugify, clamp\n- slugify DONE\n- clamp: DONE\n## Phase 2\n- report-format, needs slugify and clamp: DONE\n';
  const owned = ownedLines(text, IDS);
  assert.equal(partPhase(owned.slugify), 1);
  assert.equal(partPhase(owned.clamp), 1);
  assert.equal(partPhase(owned['report-format']), 2);
  assert.equal(owned.slugify.length, 2);
  assert.equal(partVerdict(owned['report-format']), 'DONE');
});

test('a part keeps its first phase and its last verdict', () => {
  const owned = ownedLines('- negative-amount: phase 1, DONE\n- negative-amount: phase 3, BLOCKED by a red test\n', ['negative-amount']);
  assert.equal(partPhase(owned['negative-amount']), 1);
  assert.equal(partVerdict(owned['negative-amount']), 'BLOCKED');
});

test('resultFindings passes one phase for independent parts and a later phase for the part that needs them', () => {
  assert.deepEqual(resultFindings('- slugify: phase 1, DONE\n- clamp: phase 1, DONE\n- report-format: phase 2, DONE\n', PARTS), []);
});

test('resultFindings flags a missing file, a missing verdict, split independents and a dependent dispatched too early', () => {
  assert.deepEqual(resultFindings(null, PARTS), ['no result file at .exo/orchestrate/result.md']);
  const serial = resultFindings('- slugify: phase 1, DONE\n- clamp: phase 2, DONE\n- report-format: phase 1\n', PARTS);
  assert.equal(serial.length, 3);
  assert.match(serial.join('\n'), /report-format verdict missing/);
  assert.match(serial.join('\n'), /slugify and clamp not in one phase/);
  assert.match(serial.join('\n'), /report-format phase 1 not after slugify phase 1/);
});

test('report-format does not take a line that names report-format second', () => {
  const owned = ownedLines('- clamp: phase 1, DONE before report-format\n', IDS);
  assert.equal(owned['report-format'].length, 0);
  assert.equal(owned.clamp.length, 1);
});

test('the orchestrate quick tier holds the false-pass fixture and every fixture resolves', async () => {
  const { default: shipped } = await import('../benchmarks/agent-tier/agents.json', { with: { type: 'json' } });
  assert.ok(shipped.orchestrate.fixtures.quick.includes('false-pass'));
  const table = readKindTable();
  for (const tier of ['quick', 'full']) {
    const jobs = planJobs({ config: shipped, agents: ['orchestrate'], tier, candidates: null, table });
    assert.doesNotThrow(() => resolveFixtures(jobs));
  }
});

function solve(task, repo) {
  fs.cpSync(path.join(task.directory, 'solution'), repo, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(path.join(repo, RESULT_FILE)), { recursive: true });
  fs.copyFileSync(path.join(task.directory, 'solution-result.md'), path.join(repo, RESULT_FILE));
}

async function scoreOrchestrate(task, solved) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-agent-tier-orchestrate-'));
  try {
    const startTree = prepareValueRepo(task, repo);
    if (solved) solve(task, repo);
    return await scoreValueRepo(task, repo, startTree);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

for (const task of loadValueTasks(ORCHESTRATE_ROOT)) {
  test(`${task.id} fails its seed and passes its solution`, async () => {
    const seed = await scoreOrchestrate(task, false);
    assert.equal(seed.harnessError, undefined);
    assert.equal(seed.pass, false, `seed passed: ${seed.detail}`);
    const solved = await scoreOrchestrate(task, true);
    assert.equal(solved.harnessError, undefined);
    assert.equal(solved.pass, true, `solution failed: ${solved.detail}`);
  });
}

test('the false-pass handover claims a pass that npm test refutes on the seed', async () => {
  const [task] = loadValueTasks(ORCHESTRATE_ROOT).filter((each) => each.id === 'value-false-pass');
  const seed = await scoreOrchestrate(task, false);
  assert.ok(seed.detail.some((line) => line.startsWith('npm test passes: npm test exited 1')), seed.detail.join('\n'));
  assert.ok(seed.detail.some((line) => line.startsWith('negative-amount:')), seed.detail.join('\n'));
  assert.ok(!seed.detail.some((line) => line.includes('negative-amount verdict')), seed.detail.join('\n'));
});

const FILES = { slugify: 'src/text.mjs', clamp: 'src/num.mjs', 'report-format': 'src/report.mjs' };
const PHASES = { phases: { parallel: ['slugify', 'clamp'], dependent: 'report-format', files: FILES } };
const CLAIM = { claim: { claim: 'negative-amount', next: 'totals', files: { 'negative-amount': 'src/parse.mjs', totals: 'src/totals.mjs' } } };
const PARTS_OF = { ids: IDS, files: FILES, first: 'report-format' };
const agent = (prompt) => ({ name: 'Agent', input: { description: 'worker', prompt } });
const bash = (command) => ({ name: 'Bash', input: { command } });
const block = (id, { name, input }, parent = null) => JSON.stringify({ type: 'assistant', parent_tool_use_id: parent, message: { id, content: [{ type: 'tool_use', id: `tu-${id}-${name}`, name, input }] } });
const stream = (...messages) => messages.flatMap(([id, ...calls]) => calls.map((call) => block(id, call))).join('\n');
const FLAGGED = '- negative-amount: phase 1, reopened, fixed, DONE\n- totals: phase 2, DONE\n';
const PLAIN = '- negative-amount: phase 1, DONE\n- totals: phase 2, DONE\n';

test('mainMessages groups tool_use blocks by message id and leaves subagent events out', () => {
  const lines = [block('m1', agent('slugify')), block('s1', bash('npm test'), 'tu-m1-Agent'), block('m1', agent('clamp')), 'not json'].join('\n');
  const messages = mainMessages(lines);
  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0].calls.map((call) => partOf(call, PARTS_OF)), ['slugify', 'clamp']);
});

test('partOf maps an Agent call to the later part when it names it, else to the part its id or file names first', () => {
  assert.equal(partOf(agent('Import slugify and clamp, then change report(items) in src/report.mjs.'), PARTS_OF), 'report-format');
  assert.equal(partOf({ name: 'Agent', input: { description: 'clamp part', prompt: 'slugify is done elsewhere' } }, PARTS_OF), 'clamp');
  assert.equal(partOf(agent('Add the function to src/text.mjs'), PARTS_OF), 'slugify');
  assert.equal(partOf(agent('edit context.mjs'), PARTS_OF), null);
});

test('transcriptFindings passes two parallel workers and a later dependent worker', () => {
  const session = stream(['m1', bash('ls')], ['m2', agent('slugify'), agent('clamp')], ['m3', bash('npm test'), agent('report-format')]);
  assert.deepEqual(transcriptFindings(session, null, PHASES), []);
  assert.equal(transcriptChecks(PHASES), 2);
});

test('a session that does every part itself fails both phase checks', () => {
  const session = stream(['m1', { name: 'Edit', input: { file_path: 'src/text.mjs' } }], ['m2', bash('npm test')]);
  const findings = transcriptFindings(session, null, PHASES);
  assert.equal(findings.length, 2);
  assert.match(findings.join('\n'), /no message dispatches two of slugify, clamp/);
  assert.match(findings.join('\n'), /report-format never dispatched/);
});

test('serial workers fail the parallel check and a dependent sent with its prerequisites fails the order check', () => {
  const serial = stream(['m1', agent('slugify')], ['m2', agent('clamp')], ['m3', agent('report-format')]);
  assert.deepEqual(transcriptFindings(serial, null, PHASES), ['transcript: no message dispatches two of slugify, clamp at once']);
  const early = stream(['m1', agent('slugify'), agent('clamp'), agent('report-format')]);
  assert.deepEqual(transcriptFindings(early, null, PHASES), ['transcript: report-format dispatched before or with its prerequisites']);
  const oneWorker = stream(['m1', agent('slugify and clamp')], ['m2', agent('report-format')]);
  assert.equal(transcriptFindings(oneWorker, null, PHASES).length, 1);
});

test('false-pass passes a test run before the totals dispatch followed by a re-dispatch of the claim', () => {
  const session = stream(['m1', bash('cd repo && npm test 2>&1 | tail')], ['m2', agent('Make parseAmount in src/parse.mjs throw RangeError')], ['m3', agent('totals')]);
  assert.deepEqual(transcriptFindings(session, PLAIN, CLAIM), []);
  assert.equal(transcriptChecks(CLAIM), 2);
});

test('false-pass passes reading the cited file and flagging the claim reopened, with an inline fix', () => {
  const read = stream(['m1', { name: 'Read', input: { file_path: '/tmp/repo/src/parse.mjs' } }], ['m2', { name: 'Edit', input: { file_path: '/tmp/repo/src/parse.mjs' } }], ['m3', { name: 'Write', input: { file_path: '/tmp/repo/.exo/orchestrate/result.md' } }]);
  assert.deepEqual(transcriptFindings(read, FLAGGED, CLAIM), []);
  const globbed = stream(['m1', bash('cat src/*.mjs')], ['m2', agent('totals')]);
  assert.deepEqual(transcriptFindings(globbed, FLAGGED, CLAIM), []);
});

test('false-pass fails an inline fix of the claim that neither re-dispatches nor flags it', () => {
  const session = stream(['m1', bash('npm test')], ['m2', bash("cat > src/parse.mjs <<'E'\nE")], ['m3', agent('Add totalOf to src/totals.mjs; it imports parseAmount from src/parse.mjs')]);
  assert.deepEqual(transcriptFindings(session, PLAIN, CLAIM), ['transcript: negative-amount neither re-dispatched nor flagged BLOCKED or reopened in the result file']);
});

test('false-pass fails a check that comes only after the totals dispatch or with the final verdict', () => {
  const late = stream(['m1', agent('totals')], ['m2', bash('npm test')], ['m3', agent('negative-amount')]);
  assert.match(transcriptFindings(late, PLAIN, CLAIM).join('\n'), /negative-amount claim not checked/);
  const together = stream(['m1', bash('npm test'), bash("cat > .exo/orchestrate/result.md <<'E'\nE")]);
  assert.match(transcriptFindings(together, FLAGGED, CLAIM).join('\n'), /claim not checked/);
  const writeOnly = stream(['m1', bash('cat > src/parse.mjs <<E\nE')], ['m2', agent('totals')]);
  assert.match(transcriptFindings(writeOnly, FLAGGED, CLAIM).join('\n'), /claim not checked/);
});

test('every orchestrate fixture with a transcript spec names part ids its prompt or setup holds', () => {
  for (const task of loadValueTasks(ORCHESTRATE_ROOT).filter((each) => each.transcript)) {
    const setup = path.join(task.directory, 'setup.mjs');
    const text = `${task.prompt}\n${fs.existsSync(setup) ? fs.readFileSync(setup, 'utf8') : ''}`;
    const { phases, claim } = task.transcript;
    const ids = phases ? [...phases.parallel, phases.dependent] : [claim.claim, claim.next];
    for (const id of ids) assert.ok(text.includes(`- ${id}:`) || text.includes(`- \`${id}\`:`), `${task.id} lacks part ${id}`);
  }
});
