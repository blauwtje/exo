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

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const agentsRoot = path.join(repositoryRoot, 'agents');
const skillsRoot = path.join(repositoryRoot, 'skills');

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
  'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Agent', 'WebFetch', 'WebSearch', 'NotebookEdit', 'Skill', 'SendMessage', 'TaskStop',
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

function skillMarkdown() {
  return fs.readdirSync(skillsRoot, { recursive: true })
    .filter((relativePath) => relativePath.endsWith('.md'))
    .map((relativePath) => fs.readFileSync(path.join(skillsRoot, relativePath), 'utf8'))
    .join('\n');
}

test('every agent uses only the frontmatter keys a plugin agent supports', () => {
  for (const agent of agents) {
    assert.deepEqual(unsupportedKeys(agent.frontmatter), [], `${agent.fileName} carries unsupported keys`);
  }
});

test('the key allowlist accepts memory and color and rejects remember', () => {
  assert.deepEqual(unsupportedKeys({ name: 'a', memory: 'project', color: 'blue' }), []);
  assert.deepEqual(unsupportedKeys({ name: 'a', remember: 'project' }), ['remember']);
});

test('only run-unit sets the one-hour prompt cache', () => {
  for (const agent of agents) {
    const expected = agent.fileName === 'run-unit.md' ? '{ cacheTtl: 1h }' : undefined;
    assert.equal(agent.frontmatter.experimental, expected, `${agent.fileName} experimental key`);
  }
});

test('every agent is named after its file', () => {
  for (const agent of agents) {
    assert.equal(`${agent.frontmatter.name}.md`, agent.fileName);
  }
});

test('no agent pins a model or effort, so each inherits the session', () => {
  for (const agent of agents) {
    assert.equal(agent.frontmatter.model, undefined, `${agent.fileName} model`);
    assert.equal(agent.frontmatter.effort, undefined, `${agent.fileName} effort`);
  }
});

test('an agent on the fast tier pins low effort, so no session effort reaches it', () => {
  const fastModel = kindTable.providers[kindTable.provider].tiers.fast;
  for (const agent of agents) {
    if (agent.frontmatter.model !== fastModel) continue;
    assert.equal(agent.frontmatter.effort, 'low', `${agent.fileName} effort on ${fastModel}`);
  }
});

const NO_DELETE = 'Never delete a file, container, volume, database, branch or credential to get past a blocked state: that state is evidence and the data behind it is often the only copy. Report the situation with two or three options instead.';

test('every agent that loads no CLAUDE.md and holds Bash carries the no-delete rule itself', () => {
  const missing = agents
    .filter((agent) => agent.frontmatter.omitClaudeMd === 'true')
    .filter((agent) => (agent.frontmatter.tools ?? '').split(', ').includes('Bash'))
    .filter((agent) => !agent.body.includes(NO_DELETE))
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

test('fix-review, solve-hard and run-unit hold the TaskStop their bodies tell them to run', () => {
  for (const name of ['fix-review', 'solve-hard', 'run-unit']) {
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
  assert.match(docs.body, /Compact, at most 12 lines, exactly these headings/);
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

test('every agent a skill dispatches has a file, and every agent file is dispatched', () => {
  const dispatched = new Set([...skillMarkdown().matchAll(/`exo:([a-z-]+)` agent/g)].map((match) => match[1]));
  const defined = new Set(agents.map((agent) => agent.frontmatter.name));
  assert.deepEqual([...dispatched].filter((name) => !defined.has(name)), [], 'a skill dispatches an agent with no file');
  assert.deepEqual([...defined].filter((name) => !dispatched.has(name)), [], 'an agent file no skill dispatches');
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

test('build sends a FINDINGS review to a build-kind fixer from review-fixer-prompt.md', () => {
  const fixerPath = path.join(skillsRoot, 'build', 'review-fixer-prompt.md');
  assert.ok(fs.existsSync(fixerPath), 'skills/build/review-fixer-prompt.md exists');
  const fixerPrompt = fs.readFileSync(fixerPath, 'utf8');
  assert.ok(fixerPrompt.includes('`fixed=<n> reported=<n> report=<path>`'), 'the fixer returns one count line');
  assert.ok(fixerPrompt.includes('hands the `exo:fix-review` agent when the branch review'));
  const implementing = fs.readFileSync(path.join(skillsRoot, 'build', 'SKILL.md'), 'utf8');
  const verifying = fs.readFileSync(path.join(skillsRoot, 'gate', 'SKILL.md'), 'utf8');
  assert.match(verifying, /`FINDINGS`[^\n]*`\.\.\/build\/review-fixer-prompt\.md`/);
  assert.match(implementing, /\| `review-fixer-prompt\.md` \|/);
  const repairStep = verifying.match(/^3\. \*\*Repair the findings\.\*\*[\s\S]*?(?=^4\. )/m)[0];
  const repairAfter = fs.readFileSync(path.join(skillsRoot, 'gate', 'references', 'repair.md'), 'utf8');
  assert.ok(repairStep.includes('`references/repair.md`'), 'step 3 hands the work after the fixer to repair.md');
  const repairRun = repairAfter.indexOf('gate.mjs" --repair');
  const probeRun = repairAfter.indexOf('run-probes.mjs');
  const loopFollow = repairAfter.indexOf('Follow the `LOOP` line');
  const fixDiffReview = repairAfter.indexOf('per the `DISPATCH Repair` line');
  assert.ok(repairRun !== -1 && probeRun !== -1 && repairRun < loopFollow && probeRun < loopFollow, 'gate starts the repair recheck and the probes together, before it follows LOOP');
  assert.ok(loopFollow !== -1 && loopFollow < fixDiffReview, 'gate follows the LOOP line before the fix diff review');
  for (const next of ['next=fix', 'next=stop', 'next=done']) assert.ok(repairAfter.slice(loopFollow, fixDiffReview).includes(`\`${next}\``), `repair.md acts on ${next}`);
  assert.ok(!repairAfter.includes('land-task.mjs'), 'the fixer commits, so repair.md runs no land-task');
  assert.match(repairAfter, /A `FAIL probe` line ends the turn/, 'a FAIL probe line ends the turn');
  assert.match(repairAfter, /No file at `<checkout>\/\.exo\/fix-review\.md`[^\n]*end the turn `BLOCKED`/, 'a missing fix-review.md ends the turn BLOCKED');
  assert.doesNotMatch(repairAfter, /A `FAIL` or `UNPLANNED` line from `gate\.mjs`/, 'the prose exit the script replaces is gone');
  assert.match(repairStep, /`fix=0`[^\n]*no `exo:fix-review` dispatch/, 'gate skips the fixer when the review holds no fix finding');
  assert.match(verifying, /^Report:[^\n]*report rule[^\n]*three lines[^\n]*`REPORT` path[^\n]*one decision/m, 'gate points to the report rule and ends on one decision');
  assert.match(verifying, /^Report:[^\n]*`question` findings/m, 'question findings stay in the message');
  assert.match(verifying, /^Report:[^\n]*`FAIL`, else `question`, else `ship`/m, 'gate orders the one decision');
  assert.ok(fixerPrompt.includes('run the `Run:` command, else the `Proof:` command, of every plan task'), 'the fixer falls back to Proof: for a compact task');
  assert.ok(fixerPrompt.includes("grep -nE 'Files:|Proof:|Run:'"), 'the fixer finds Files:, Proof: and Run: unanchored');
});

test('the implementer pins no model or effort', () => {
  const implementer = agents.find((agent) => agent.frontmatter.name === 'build-task');
  assert.ok(implementer, 'agents/build-task.md exists');
  assert.equal(implementer.frontmatter.model, undefined);
  assert.equal(implementer.frontmatter.effort, undefined);
  assert.equal(implementer.frontmatter.omitClaudeMd, undefined, 'the implementer reads CLAUDE.md');
});

test('a Design: task with a named direction goes to a design-ui delegate, not the implementer', () => {
  const implementer = agents.find((agent) => agent.frontmatter.name === 'build-task');
  assert.ok(implementer, 'agents/build-task.md exists');
  assert.doesNotMatch(implementer.body, /enter it at its Build phase/);
  assert.doesNotMatch(implementer.frontmatter.description, /opus/);

  const designTasksPath = path.join(skillsRoot, 'build', 'references', 'design-tasks.md');
  const designTasks = fs.readFileSync(designTasksPath, 'utf8');
  assert.doesNotMatch(designTasks, /exo:build-task/);
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
    assert.match(reviewer.body, /`Red:` line reads `none` or is missing/, `${reviewer.fileName} Red: rule`);
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
  assert.match(reviewer.body, /each on one line, no heading per finding/, 'a finding shares one line');
  assert.match(reviewer.body, /^\S+:\d+-\d+;.*\b(defect|concern|question|note)\b.*\b(fix|report)\n {2}Probe: \S/m, 'an example finding line with its Probe line');
});

test('the branch reviewer quotes one verbatim line under each fix finding, after Probe, Class and Sweep', () => {
  const reviewer = agents.find((agent) => agent.frontmatter.name === 'review-branch');
  assert.match(reviewer.body, /`  Sweep: <read-only grep, diff files>`, `  Quote: <verbatim line>` under it/, 'the fix rule names the Quote line after Sweep');
  assert.match(reviewer.body, /^ {2}Probe: \S.*\n {2}Class: \S.*\n {2}Sweep: \S.*\n {2}Quote: \S/m, 'the example finding ends with a Quote line');
});

test('the branch reviewer confirms with one test file or Probe command, never the full suite', () => {
  const reviewer = agents.find((agent) => agent.frontmatter.name === 'review-branch');
  assert.match(reviewer.body, /single test file or `Probe:` command/, 'only a single test file or Probe command');
  for (const banned of ['`gate.mjs`', '`npm run check`', '`npm run validate`', '`npm test`']) {
    assert.ok(reviewer.body.includes(banned), `${banned} is named as forbidden`);
  }
  assert.match(reviewer.body, /needs the full suite → `question`/, 'a full-suite finding goes to question');
});

test('the open-points finder is read-only, runs the decisions check first and caps its report', () => {
  const finder = agents.find((agent) => agent.frontmatter.name === 'find-open-points');
  assert.deepEqual(finder.frontmatter.tools.split(', '), ['Read', 'Write', 'Glob', 'Grep', 'Bash']);
  assert.equal(finder.frontmatter.effort, undefined);
  assert.equal(finder.frontmatter.model, undefined);
  assert.ok(finder.body.indexOf('memory.mjs" decisions') > 0, 'no decisions run');
  assert.ok(finder.body.includes('[user] <point>'));
  assert.ok(finder.body.includes('Return at most 10 lines'), 'return capped at 10 lines');
  assert.ok(finder.body.includes('Assumptions: <path>'), 'return names the assumptions file');
  assert.doesNotMatch(finder.body, /Write nothing/, 'it writes the assumptions file');
});

// Wall time: a lookup that waits on another lookup it does not depend on costs a
// whole delegate round trip, so independent opening calls share one message.
const specSkill = fs.readFileSync(path.join(skillsRoot, 'spec/SKILL.md'), 'utf8');

test('spec dispatches locate-code and fetch-docs in one message, and find-open-points opens with its reads together', () => {
  const locate = specSkill.split('\n').find((line) => line.includes('`exo:locate-code`'));
  assert.match(locate, /`exo:fetch-docs`/, 'locate-code and fetch-docs share one step line');
  assert.match(locate, /one message/, 'spec sends both lookups in one message');
  const finder = agents.find((agent) => agent.frontmatter.name === 'find-open-points');
  assert.match(finder.body, /^- First message: Read the brief and run `node [^\n]*memory\.mjs" decisions` together\.$/m);
  assert.doesNotMatch(finder.body, /before anything else/, 'no second opening call is ordered first');
});

test('build-task reads its brief, lean.md and code-standard.md in its first message', () => {
  const implementer = agents.find((agent) => agent.frontmatter.name === 'build-task');
  assert.match(implementer.body, /^- No text before the first tool call; first call: Read brief, `\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/route-skills\/references\/lean\.md` and `\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/route-skills\/references\/code-standard\.md` once, never a `<checkout>` copy\.$/m);
});

test('review-branch reads its opening inputs together in its first message', () => {
  const reviewer = agents.find((agent) => agent.frontmatter.name === 'review-branch');
  assert.match(reviewer.body, /^- First message: Read plan `## Goal`, `## Non-goals`, `## Context`, standard, diff and nearest `CLAUDE\.md`\/`AGENTS\.md` together; then changed ranges\.$/m);
});

test('run-unit dispatches every build and repair in the foreground and never ends its turn on a dispatch', () => {
  const unit = agents.find((agent) => agent.frontmatter.name === 'run-unit');
  assert.match(unit.body, /^ {2}- A `Wave:` or `Start:` build runs in a `Slot:` worktree the script opened; run no `git worktree`; `Wave discarded:` → its `Next:` block builds alone\.$/m);
  assert.match(unit.body, /^ {2}- Dispatch each build and repair in the foreground, never `run_in_background`; never end the turn while one runs or lands: run-unit gets no completion notification, so its turn end is its return\.$/m);
  assert.match(unit.body, /^ {2}- Every `Prompt:` of a block goes as a foreground call in one message; it returns after each build's report\.$/m);
  assert.match(unit.body, /^ {2}- Land each returned slot via `Land <n>:`, all via `Land all:`; a `LANDED` refill block likewise\.$/m);
  assert.match(unit.body, /^ {2}- A returned build with no report is resumed once with SendMessage to write it; still none leaves its slot in place, no cap; never a `sleep` command\.$/m);
  assert.match(unit.body, /^ {2}- Loop until every block task has a `LANDED` or `BLOCKED` line\.$/m);
  assert.match(unit.body, /land-task\.mjs[^\n]* --next` with timeout 600000/);
  assert.doesNotMatch(unit.body, /(?<!never )end the turn/i);
  assert.doesNotMatch(unit.body, /runs in the background in a/);
  assert.doesNotMatch(unit.body, /notification resumes|notified/);
  assert.doesNotMatch(unit.body, /`Wait:`/);
  assert.doesNotMatch(unit.body, /no report`/);
});

test('run-unit runs on its own kind, at low effort', () => {
  assert.equal(kindTable.agents['agents/run-unit.md'].kind, 'run-unit');
  assert.deepEqual(kindTable.kinds['run-unit'], { model: 'sonnet', effort: 'medium' });
});

test('every skill that cites the report rule names closing.md, which defines it', () => {
  const closing = fs.readFileSync(path.join(skillsRoot, 'route-skills/references/closing.md'), 'utf8');
  assert.match(closing, /^## Report rule$/m, 'closing.md defines the report rule');
  for (const file of ['check-docs/SKILL.md', 'edit-skills/references/skill-shape.md', 'gate/SKILL.md', 'ship/SKILL.md', 'refactor/SKILL.md', 'build/references/tail.md', 'find-cause/SKILL.md']) {
    assert.match(fs.readFileSync(path.join(skillsRoot, file), 'utf8'), /closing\.md/, `${file} cites closing.md`);
  }
  for (const owner of ['edit-skills', 'gate', 'ship', 'refactor', 'build', 'find-cause']) {
    assert.match(fs.readFileSync(path.join(skillsRoot, owner, 'SKILL.md'), 'utf8'), /^\| `\.\.\/route-skills\/references\/closing\.md` \|/m, `${owner} lists closing.md in its References table`);
  }
});

test('every lead wait on a background dispatch bans a wakeup, since a pending one keeps claude -p alive', () => {
  for (const file of ['build/references/run-loop.md', 'build/references/design-tasks.md', 'gate/SKILL.md', 'gate/references/repair.md', 'spec/references/watching.md']) {
    assert.match(fs.readFileSync(path.join(skillsRoot, file), 'utf8'), /ScheduleWakeup[^\n]*Monitor or sleep/, `${file} bans ScheduleWakeup while it waits`);
  }
});

test('only build-task and doc-task hold a retry cell, above their on cell', () => {
  const table = JSON.parse(fs.readFileSync(new URL('../lib/model-kinds.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(table.kinds).filter((kind) => table.kinds[kind].retry), ['build-task', 'doc-task']);
  assert.deepEqual(readKindTable(undefined, { retry: true }).kinds['build-task'], { model: 'opus', effort: 'high' });
  assert.deepEqual(readKindTable(undefined, { retry: true }).kinds['doc-task'], { model: 'opus', effort: 'high' });
  assert.deepEqual(readKindTable(undefined, { retry: true }).kinds.review, kindTable.kinds.review);
});

test('the branch reviewer takes its input path from the dispatch and reports Read: paths and the out-of-scope weight', () => {
  const reviewer = agents.find((agent) => agent.frontmatter.name === 'review-branch');
  assert.match(reviewer.body, /Read the dispatch's `input=` path first, else `<checkout>\/\.exo\/review-input\.md`/);
  assert.match(reviewer.body, /`out-of-scope`: input class under a task's `Boundary:` `out`/);
  assert.match(reviewer.body, /`Read: <paths>`/);
});

test('orchestrate holds Agent, Write and TaskStop, loads the project CLAUDE.md and runs on coordinate', () => {
  const orchestrate = agents.find((agent) => agent.frontmatter.name === 'orchestrate');
  const tools = orchestrate.frontmatter.tools.split(', ');
  for (const tool of ['Agent', 'Write', 'TaskStop']) assert.ok(tools.includes(tool), `orchestrate lists ${tool}`);
  assert.equal(orchestrate.frontmatter.omitClaudeMd, undefined);
  assert.equal(kindTable.agents['agents/orchestrate.md'].kind, 'coordinate');
});

test('orchestrate works in phases, keeps worker detail in files and hands over at the exo context note', () => {
  const { body } = agents.find((agent) => agent.frontmatter.name === 'orchestrate');
  assert.match(body, /Before the first dispatch → write the result file/);
  assert.match(body, /After each phase → [^\n]*result file/);
  assert.match(body, /at most 5 lines, detail in a named file/);
  assert.match(body, /never a whole log, diff or detail file/);
  assert.match(body, /exo context note → [^\n]*no new phase[^\n]*return its path/);
});
