// A plugin agent's frontmatter is read by the harness, not by the model, so a
// wrong key, a turn budget that disagrees with its limit or a script flag that
// does not exist fails silently in a real run. These checks hold the agent
// files to what the harness and the scripts accept, without dispatching one.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readKindTable } from '#model-kinds';
import { GUARD_RULES, briefedPrompt } from '../lib/guard-rules.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const agentsRoot = path.join(repositoryRoot, 'agents');

// The keys code.claude.com/docs/en/plugins-reference lists for a plugin agent.
const SUPPORTED_KEYS = [
  'name', 'description', 'model', 'effort', 'maxTurns', 'tools',
  'disallowedTools', 'skills', 'memory', 'color', 'autoCompactWindow', 'background', 'omitClaudeMd',
  'isolation', 'experimental',
];

function unsupportedKeys(frontmatter) {
  return Object.keys(frontmatter).filter((key) => !SUPPORTED_KEYS.includes(key));
}
const KNOWN_TOOLS = [
  'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Agent', 'WebFetch', 'WebSearch', 'NotebookEdit', 'Skill', 'SendMessage', 'TaskStop', 'Monitor',
];
const ORDINAL_TURNS = { tenth: 10, fifteenth: 15, twentieth: 20, thirtieth: 30, fortieth: 40, fiftieth: 50 };

function readAgent(fileName) {
  const text = fs.readFileSync(path.join(agentsRoot, fileName), 'utf8');
  const lines = text.split('\n');
  const closing = lines.indexOf('---', 1);
  assert.ok(lines[0] === '---' && closing > 0, `${fileName} has no frontmatter block`);
  const frontmatter = {};
  for (const line of lines.slice(1, closing)) {
    const separator = line.indexOf(': ');
    assert.ok(separator > 0, `${fileName} has an unreadable frontmatter line: ${line}`);
    frontmatter[line.slice(0, separator)] = line.slice(separator + 2);
  }
  const body = lines.slice(closing + 1).join('\n');
  return { fileName, frontmatter, body };
}

const kindTable = readKindTable();

const agents = fs.readdirSync(agentsRoot)
  .filter((fileName) => fileName.endsWith('.md'))
  .map(readAgent);

test('every agent uses only the frontmatter keys a plugin agent supports', () => {
  for (const agent of agents) {
    assert.deepEqual(unsupportedKeys(agent.frontmatter), [], `${agent.fileName} carries unsupported keys`);
  }
});

test('the key allowlist accepts memory and color and rejects remember', () => {
  assert.deepEqual(unsupportedKeys({ name: 'a', memory: 'project', color: 'blue' }), []);
  assert.deepEqual(unsupportedKeys({ name: 'a', remember: 'project' }), ['remember']);
});

test('only task-runner sets the one-hour prompt cache', () => {
  for (const agent of agents) {
    const expected = agent.fileName === 'task-runner.md' ? '{ cacheTtl: 1h }' : undefined;
    assert.equal(agent.frontmatter.experimental, expected, `${agent.fileName} experimental key`);
  }
});

test('task-runner lists Write so it can hand over at the hard context limit', () => {
  const taskRunner = agents.find((agent) => agent.fileName === 'task-runner.md');
  const tools = taskRunner.frontmatter.tools.split(', ');
  assert.ok(tools.includes('Write'), 'task-runner tools lack Write, the one tool the hard limit still allows');
});

test('every agent is named after its file', () => {
  for (const agent of agents) {
    assert.equal(`${agent.frontmatter.name}.md`, agent.fileName);
  }
});

test('an agent on the fast tier pins low effort, so no session effort reaches it', () => {
  const fastModel = kindTable.providers[kindTable.provider].tiers.fast;
  for (const agent of agents) {
    if (agent.frontmatter.model !== fastModel) continue;
    assert.equal(agent.frontmatter.effort, 'low', `${agent.fileName} effort on ${fastModel}`);
  }
});

test('every brief to an agent that holds Bash carries the no-delete rule from one source', () => {
  const rule = GUARD_RULES.find((row) => row.id === 'no-delete').brief;
  const missing = agents
    .filter((agent) => (agent.frontmatter.tools ?? '').split(', ').includes('Bash'))
    .filter((agent) => !briefedPrompt('task', agent.frontmatter.tools.split(', ')).includes(rule))
    .map((agent) => agent.fileName);
  assert.deepEqual(missing, []);
});

test('every listed tool is a tool the harness has', () => {
  for (const agent of agents) {
    if (agent.frontmatter.tools === undefined) continue;
    const unknown = agent.frontmatter.tools.split(', ').filter((tool) => !KNOWN_TOOLS.includes(tool));
    assert.deepEqual(unknown, [], `${agent.fileName} lists unknown tools`);
  }
});

test('fix-review, solve-hard and task-runner hold the TaskStop their bodies tell them to run', () => {
  for (const name of ['fix-review', 'solve-hard', 'task-runner']) {
    const agent = agents.find((candidate) => candidate.frontmatter.name === name);
    assert.ok(agent.body.includes('TaskStop'), `${name} body names TaskStop`);
    assert.ok(agent.frontmatter.tools.split(', ').includes('TaskStop'), `${name} lists TaskStop in tools`);
  }
});

test('fetch-docs has no Write tool and gives no rule about a file it writes', () => {
  const docs = agents.find((agent) => agent.frontmatter.name === 'fetch-docs');
  assert.ok(!docs.frontmatter.tools.split(', ').includes('Write'), 'fetch-docs lists Write');
  assert.ok(!docs.body.includes('any file you write'), 'fetch-docs body still gives a rule for a file it writes');
});

test('an agent that only locates or reviews carries no tool that edits the repository', () => {
  const explorer = agents.find((agent) => agent.frontmatter.name === 'locate-code');
  assert.deepEqual(explorer.frontmatter.tools.split(', ').filter((tool) => ['Edit', 'Agent'].includes(tool)), []);
  assert.match(explorer.body, /Write one file only: the report, at the `\.exo\/<topic>\/` path/);
  assert.match(explorer.body, /Return at most 10 lines/);
  const docs = agents.find((agent) => agent.frontmatter.name === 'fetch-docs');
  assert.match(docs.body, /Write at most 12 lines, with exactly these headings/);
});

test('a turn budget in the body equals maxTurns and leaves turns to write the report', () => {
  for (const agent of agents) {
    const budget = /you have (\d+) turns/i.exec(agent.body);
    if (budget === null) continue;
    const maxTurns = Number(agent.frontmatter.maxTurns);
    assert.equal(Number(budget[1]), maxTurns, `${agent.fileName} names a budget other than its maxTurns`);
    const writeBy = /by your (\w+) turn/i.exec(agent.body);
    assert.ok(writeBy, `${agent.fileName} names a budget but no turn to write by`);
    const writeByTurn = ORDINAL_TURNS[writeBy[1].toLowerCase()];
    assert.ok(writeByTurn < maxTurns, `${agent.fileName} writes by its ${writeBy[1]} turn, not before turn ${maxTurns}`);
  }
});

test('the budget twins fold into their base agents, which a dispatch runs at the call\'s model and effort', () => {
  for (const twin of ['review-branch-deep', 'review-branch-deep-high', 'solve-hard-high', 'solve-hard-low']) {
    assert.ok(!agents.some((agent) => agent.frontmatter.name === twin), `agents/${twin}.md is still an agent file`);
  }
  assert.deepEqual(Object.keys(kindTable.agents).filter((file) => kindTable.agents[file].generatedFrom !== undefined), []);
  const source = agents.find((agent) => agent.frontmatter.name === 'solve-hard');
  assert.equal(source.frontmatter.model, undefined);
  assert.match(source.body, /carry out the prompt you are handed/i);
  assert.ok(agents.find((agent) => agent.frontmatter.name === 'review-branch').body.includes('the findings path the dispatch names'), 'the dispatch names the findings path');
});

test('a branch reviewer reads and reports: no edit tool, no fix, no final verification, one return line', () => {
  const reviewer = agents.find((agent) => agent.frontmatter.name === 'review-branch');
  assert.ok(reviewer.frontmatter.tools, 'the reviewer lists its tools');
  assert.deepEqual(reviewer.frontmatter.tools.split(', ').filter((tool) => ['Edit', 'NotebookEdit', 'Agent'].includes(tool)), []);
  assert.doesNotMatch(reviewer.frontmatter.description, /\bfix|final verification/i);
  assert.doesNotMatch(reviewer.body, /run every Final verification|`fixed` or `reported`|`FIXED`/);
  assert.ok(reviewer.body.includes('`verdict=CLEAN|FINDINGS|BLOCKED defect=<n> concern=<n> question=<n> note=<n> fix=<n> report=<path>`'), 'the reviewer returns one verdict line with its fix count');
});

test('the implementer reads CLAUDE.md', () => {
  const implementer = agents.find((agent) => agent.frontmatter.name === 'build-task');
  assert.ok(implementer, 'agents/build-task.md exists');
  assert.equal(implementer.frontmatter.omitClaudeMd, undefined, 'the implementer reads CLAUDE.md');
});

test('the implementer names test-design.md and reports Test first: and Red: lines', () => {
  const builder = agents.find((agent) => agent.frontmatter.name === 'build-task');
  assert.ok(builder, 'agents/build-task.md exists');
  assert.match(builder.body, /test-design\.md/);
  assert.match(builder.body, /Test first:/);
  assert.match(builder.body, /Red:/);
});

test('the branch reviewer holds the test-first rule and the missing-Red: rule', () => {
  const reviewers = agents.filter((agent) => agent.fileName.startsWith('review-branch'));
  assert.equal(reviewers.length, 1, 'one branch reviewer exists');
  for (const reviewer of reviewers) {
    assert.match(reviewer.body, /test-first/, `${reviewer.fileName} test-first rule`);
    assert.match(reviewer.body, /`Test first: yes`/, `${reviewer.fileName} Test first: yes`);
    assert.match(reviewer.body, /`Red:` line is `none` or missing/, `${reviewer.fileName} Red: rule`);
  }
});

test('the branch reviewer requires a Probe line under each fix finding and names merge-reviews.mjs as the reader of its findings file', () => {
  const reviewer = agents.find((agent) => agent.frontmatter.name === 'review-branch');
  assert.match(reviewer.body, /`  Probe: <command>`/, 'each fix finding carries a Probe line');
  assert.match(reviewer.body, /## Probe/, 'the Probe rule points to review-rules.md ## Probe');
  assert.match(reviewer.body, /input to `merge-reviews\.mjs`/, 'merge-reviews.mjs reads the findings file');
  assert.doesNotMatch(reviewer.body, /report file is the deliverable/, 'the old deliverable wording is gone');
});

test('the branch reviewer keeps each finding on one line and shows an example the merge parser reads', () => {
  const reviewer = agents.find((agent) => agent.frontmatter.name === 'review-branch');
  assert.match(reviewer.body, /one line each and no heading per finding/, 'a finding shares one line');
  assert.match(reviewer.body, /^\S+:\d+-\d+;.*\b(defect|concern|question|note)\b.*\b(fix|report)\n {2}Probe: \S/m, 'an example finding line with its Probe line');
});

test('the branch reviewer quotes one verbatim line under each fix finding, after Probe, Class and Sweep', () => {
  const reviewer = agents.find((agent) => agent.frontmatter.name === 'review-branch');
  assert.match(reviewer.body, /`  Sweep: <read-only grep, diff files>` and `  Quote: <verbatim line>`/, 'the fix rule names the Quote line after Sweep');
  assert.match(reviewer.body, /^ {2}Probe: \S.*\n {2}Class: \S.*\n {2}Sweep: \S.*\n {2}Quote: \S/m, 'the example finding ends with a Quote line');
});

test('the branch reviewer confirms with one test file or Probe command, never the full suite', () => {
  const reviewer = agents.find((agent) => agent.frontmatter.name === 'review-branch');
  assert.match(reviewer.body, /single test file or a `Probe:` command/, 'only a single test file or Probe command');
  for (const banned of ['`gate.mjs`', '`npm run check`', '`npm run validate`', '`npm test`']) {
    assert.ok(reviewer.body.includes(banned), `${banned} is named as forbidden`);
  }
  assert.match(reviewer.body, /needs the full suite `question`/, 'a full-suite finding goes to question');
});

test('the open-points finder is read-only, runs the decisions check first and caps its report', () => {
  const finder = agents.find((agent) => agent.frontmatter.name === 'find-open-points');
  assert.deepEqual(finder.frontmatter.tools.split(', '), ['Read', 'Write', 'Bash']);
  assert.equal(finder.frontmatter.effort, undefined);
  assert.equal(finder.frontmatter.model, undefined);
  assert.ok(finder.body.indexOf('memory.mjs" decisions') > 0, 'no decisions run');
  assert.ok(finder.body.includes('[user] <point>'));
  assert.ok(finder.body.includes('Return at most 10 lines'), 'return capped at 10 lines');
  assert.ok(finder.body.includes('Assumptions: <path>'), 'return names the assumptions file');
  assert.doesNotMatch(finder.body, /Write nothing/, 'it writes the assumptions file');
});

test('build-task reads its brief, lean.md and code-standard.md in its first message', () => {
  const implementer = agents.find((agent) => agent.frontmatter.name === 'build-task');
  assert.match(implementer.body, /^- Your first call reads the brief, `lean\.md` and `code-standard\.md`, once each, the last two from `\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/route-skills\/references\/` and not a `<checkout>` copy\. When the brief says `Code rules: none`, it reads the brief only\.$/m);
  assert.match(implementer.body, /^- Edit only the `Files:` paths, and write a missing `Proof:` script first, after you read `code-standard\.md`\. Report other paths\.$/m);
  assert.match(implementer.body, /^- Send no text before the first tool call or between calls\.$/m);
});

test('review-branch reads its input file first, which holds the plan, diff, rules and triage', () => {
  const reviewer = agents.find((agent) => agent.frontmatter.name === 'review-branch');
  assert.match(reviewer.body, /^- For scope `branch`, first Read the dispatch's `input=` path, else `<checkout>\/\.exo\/review-input\.md`\.$/m);
  assert.match(reviewer.body, /^- Read only the input file, plus a path a finding you must confirm names, and the standard\.$/m);
  assert.match(reviewer.body, /^- The input file holds the plan `## Goal`, `## Non-goals`, `## Context`, the diff, the review rules, the triage text and the instruction file paths\.$/m);
});

test('task-runner dispatches every build and repair in the foreground and waits by W1 in a session and W2 in a run session', () => {
  const unit = agents.find((agent) => agent.frontmatter.name === 'task-runner');
  assert.match(unit.body, /^ {2}- A `Wave:`\/`Start:` build runs in the script's `Slot:` worktree, so run no `git worktree`; after `Wave discarded:` its `Next:` block builds alone\.$/m);
  assert.match(unit.body, /^ {2}- After `Async agent launched`, end your turn to wait \(W1\)\. In a `-p` run session run `Wait:` \(W2\), timeout 600000, never a `sleep` loop; exit 2 reruns 3 times, then `BLOCKED <n> no report`\.$/m);
  assert.match(unit.body, /^ {2}- `Detail:` names a script's full log; read it only on a failure\.$/m);
  assert.match(unit.body, /^ {2}- Land a returned slot with `Land <n>:`, all with `Land all:`; a `LANDED` refill likewise\.$/m);
  assert.match(unit.body, /^ {2}- When a build returns no report, send it one SendMessage to write it; if none follows, keep its slot, do not `sleep`\.$/m);
  assert.match(unit.body, /On `PLAN DRIFT`[^\n]*or return `BLOCKED <n> <path>` to stop/);
  assert.match(unit.body, /^ {2}- Loop until every block task has a `LANDED` or `BLOCKED` line\.$/m);
  assert.match(unit.body, /land-task\.mjs[^\n]* --next` with timeout 600000: its last block is the next dispatch, not a rerun\./);
  assert.doesNotMatch(unit.body, /end the turn/i);
  assert.doesNotMatch(unit.body, /runs in the background in a/);
  assert.doesNotMatch(unit.body, /notification resumes|notified/);
});

test('task-runner runs on its own kind, at sonnet medium', () => {
  assert.equal(kindTable.agents['agents/task-runner.md'].kind, 'task-runner');
  assert.deepEqual(kindTable.kinds['task-runner'], { model: 'sonnet', effort: 'medium' });
});

test('only build-task and doc-task hold a retry cell, above their on cell', () => {
  const table = JSON.parse(fs.readFileSync(new URL('../lib/model-kinds.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(table.kinds).filter((kind) => table.kinds[kind].retry), ['build-task', 'doc-task']);
  assert.deepEqual(readKindTable(undefined, { retry: true }).kinds['build-task'], { model: 'opus', effort: 'high' });
  assert.deepEqual(readKindTable(undefined, { retry: true }).kinds['doc-task'], { model: 'opus', effort: 'high' });
  assert.deepEqual(readKindTable(undefined, { retry: true }).kinds.review, kindTable.kinds.review);
});

test('the branch reviewer takes its input path from the dispatch and finds the review rules and triage in that input file', () => {
  const reviewer = agents.find((agent) => agent.frontmatter.name === 'review-branch');
  const rules = fs.readFileSync(new URL('../skills/gate/references/review-rules.md', import.meta.url), 'utf8');
  assert.match(reviewer.body, /first Read the dispatch's `input=` path, else `<checkout>\/\.exo\/review-input\.md`/);
  assert.match(reviewer.body, /First read `## Report` in the input file's review rules and triage sections/);
  assert.doesNotMatch(reviewer.body, /review-rules\.md/);
  assert.match(rules, /^## Report$/m);
  assert.match(rules, /`out-of-scope` finding is an input class under a task's `Boundary:` `out`, marked `report`/);
  assert.match(rules, /`Read: <paths>` for every file read/);
});

test('the branch reviewer keeps the question, nit and note weights', () => {
  const reviewer = agents.find((agent) => agent.frontmatter.name === 'review-branch');
  assert.match(reviewer.body, /Weight a nit, preference, refactor or later-only idea `note`, and use `question` only for open plan intent\./);
  assert.match(reviewer.body, /Mark a `note` `report`, never `concern`; it is style, naming, layout or a test gap, test-gap notes included\./);
});

test('orchestrator holds Agent, Write and TaskStop, loads the project CLAUDE.md and runs on orchestrator', () => {
  const orchestrator = agents.find((agent) => agent.frontmatter.name === 'orchestrator');
  const tools = orchestrator.frontmatter.tools.split(', ');
  for (const tool of ['Agent', 'Write', 'TaskStop', 'Monitor']) assert.ok(tools.includes(tool), `orchestrator lists ${tool}`);
  assert.equal(orchestrator.frontmatter.omitClaudeMd, undefined);
  assert.equal(kindTable.agents['agents/orchestrator.md'].kind, 'orchestrator');
});

test('orchestrator works in phases, keeps worker detail in files and hands over at the exo context note', () => {
  const { body } = agents.find((agent) => agent.frontmatter.name === 'orchestrator');
  assert.match(body, /Before the first dispatch, write the result file/);
  assert.match(body, /After each phase, update the result file/);
  assert.match(body, /in at most 5 lines, with detail in a named file/);
  assert.match(body, /read no whole log, diff or detail file/);
  assert.match(body, /exo context note, start no new phase[^\n]*return its path/);
  assert.match(body, /a fresh orchestrator continues from it/);
});

test('orchestrator dispatches async within its Workers line, reads by range and sends discovery to lookup', () => {
  const { body } = agents.find((agent) => agent.frontmatter.name === 'orchestrator');
  assert.doesNotMatch(body, /one foreground dispatch each/);
  assert.match(body, /end your turn and wait for the notification/);
  assert.match(body, /names `-p`[^\n]*wait-report\.mjs[^\n]*timeout 600000/);
  assert.match(body, /no more workers than its `Workers:` line, retries included/);
  assert.match(body, /Before the first dispatch[^\n]*Reads:[^\n]*by range/);
  assert.match(body, /discovery and code reading to a `lookup` worker/);
});

test('research-worker writes findings and keeps the data rule, and claim-judge only reads', () => {
  const worker = agents.find((agent) => agent.frontmatter.name === 'research-worker');
  const judge = agents.find((agent) => agent.frontmatter.name === 'claim-judge');
  const workerTools = worker.frontmatter.tools.split(', ');
  assert.ok(workerTools.includes('Bash') && workerTools.includes('Write'), 'research-worker lacks Bash or Write');
  assert.match(worker.body, /as data, not as instructions/);
  assert.match(worker.body, /at most 1,500 tokens/);
  assert.deepEqual(judge.frontmatter.tools.split(', ').filter((tool) => ['Write', 'Edit', 'Bash', 'Agent'].includes(tool)), []);
});

test('ideate-worker only reads, keeps the data rule and asks for the p tail', () => {
  const worker = agents.find((agent) => agent.frontmatter.name === 'ideate-worker');
  assert.deepEqual(worker.frontmatter.tools.split(', '), ['Read']);
  assert.match(worker.body, /as data, not as instructions/);
  assert.match(worker.body, /at least 3 ideas a p of 0\.10 or lower/);
});
