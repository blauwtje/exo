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
  'disallowedTools', 'skills', 'remember', 'background', 'omitClaudeMd', 'isolation',
  'experimental',
];
const KNOWN_TOOLS = [
  'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Agent', 'WebFetch', 'WebSearch', 'NotebookEdit', 'Skill', 'SendMessage',
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
    const unsupported = Object.keys(agent.frontmatter).filter((key) => !SUPPORTED_KEYS.includes(key));
    assert.deepEqual(unsupported, [], `${agent.fileName} carries unsupported keys`);
  }
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

test('an agent that only locates or reviews carries no tool that edits the repository', () => {
  const explorer = agents.find((agent) => agent.frontmatter.name === 'locate-code');
  const critic = agents.find((agent) => agent.frontmatter.name === 'critique-ui');
  assert.deepEqual(explorer.frontmatter.tools.split(', ').filter((tool) => ['Edit', 'Agent'].includes(tool)), []);
  assert.match(explorer.body, /Write one file only: the report, at the `\.exo\/<topic>\/` path/);
  assert.match(explorer.body, /Return at most 10 lines/);
  const docs = agents.find((agent) => agent.frontmatter.name === 'fetch-docs');
  assert.match(docs.body, /Compact, at most 12 lines, exactly these headings/);
  assert.deepEqual(critic.frontmatter.tools.split(', ').filter((tool) => ['Edit', 'Agent'].includes(tool)), []);
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

test('every script command in an agent names a script and flags that exist', () => {
  const command = /node "\$SKILL\/scripts\/([a-z-]+\.mjs)"([^`]*)`/g;
  for (const agent of agents) {
    for (const [, scriptName, argumentText] of agent.body.matchAll(command)) {
      const scriptPath = path.join(skillsRoot, 'design-ui', 'scripts', scriptName);
      assert.ok(fs.existsSync(scriptPath), `${agent.fileName} runs a missing script ${scriptName}`);
      const scriptSource = fs.readFileSync(scriptPath, 'utf8');
      const missingFlags = (argumentText.match(/--[a-z-]+/g) ?? []).filter((flag) => !scriptSource.includes(flag));
      assert.deepEqual(missingFlags, [], `${agent.fileName} passes flags ${scriptName} does not read`);
    }
  }
});

test('every reference file an agent reads exists', () => {
  for (const agent of agents) {
    for (const [, relativePath] of agent.body.matchAll(/\$SKILL\/(references\/[a-z-]+\.md)/g)) {
      assert.ok(fs.existsSync(path.join(skillsRoot, 'design-ui', relativePath)), `${agent.fileName} reads a missing ${relativePath}`);
    }
  }
});

test('every agent a skill dispatches has a file, and every agent file is dispatched', () => {
  const dispatched = new Set([...skillMarkdown().matchAll(/`exo:([a-z-]+)` agent/g)].map((match) => match[1]));
  const defined = new Set(agents.map((agent) => agent.frontmatter.name));
  assert.deepEqual([...dispatched].filter((name) => !defined.has(name)), [], 'a skill dispatches an agent with no file');
  assert.deepEqual([...defined].filter((name) => !dispatched.has(name)), [], 'an agent file no skill dispatches');
});

test('the inputs the design critic expects are the ones design-ui hands it', () => {
  const critic = agents.find((agent) => agent.frontmatter.name === 'critique-ui');
  const dispatchText = fs.readFileSync(path.join(skillsRoot, 'design-ui', 'references', 'phase-detail.md'), 'utf8');
  for (const input of ['`RUN`', '`SKILL`']) {
    assert.ok(critic.body.includes(input), `the critic does not expect ${input}`);
    assert.ok(dispatchText.includes(input), `phase-detail.md does not hand over ${input}`);
  }
});

test('the budget twins fold into their base agents, which a dispatch runs at the call\'s model and effort', () => {
  for (const twin of ['critique-ui-high', 'review-branch-deep', 'review-branch-deep-high', 'solve-hard-high', 'solve-hard-low']) {
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
  const verifying = fs.readFileSync(path.join(skillsRoot, 'verify', 'SKILL.md'), 'utf8');
  assert.match(verifying, /`FINDINGS`[^\n]*`\.\.\/build\/review-fixer-prompt\.md`/);
  assert.match(implementing, /\| `review-fixer-prompt\.md` \|/);
  const repairStep = verifying.match(/^3\. \*\*Repair the findings\.\*\*[\s\S]*?(?=^4\. )/m)[0];
  const repairAfter = fs.readFileSync(path.join(skillsRoot, 'verify', 'references', 'repair.md'), 'utf8');
  assert.ok(repairStep.includes('`references/repair.md`'), 'step 3 hands the work after the fixer to repair.md');
  const before = ["Rerun step 1's `verify.mjs`", 'run-probes.mjs', 'the scope `fix diff`'].map((text) => repairAfter.indexOf(text));
  const fixCommit = repairAfter.indexOf('land-task.mjs" --fix');
  assert.ok(before.every((index) => index !== -1 && index < fixCommit), 'verify starts the gate rerun, the probes and the fix diff review together, before the fix commit');
  const stops = [
    /A `FAIL` or `UNPLANNED` line from `verify\.mjs` ends the turn[^\n]*fixes uncommitted/,
    /A `FAIL probe` line ends the turn[^\n]*fixes uncommitted/,
    /No file at `<checkout>\/\.exo\/fix-review\.md`[^\n]*end the turn `BLOCKED`[^\n]*fixes uncommitted/,
  ].map((pattern) => repairAfter.search(pattern));
  assert.ok(stops.every((index) => index !== -1 && index < fixCommit), 'a FAIL or UNPLANNED line, a FAIL probe line or a missing fix-review.md ends the turn with fixes uncommitted, before the fix commit');
  assert.ok(Math.min(...stops) > Math.max(...before), 'verify checks the stops only after starting the rerun, the probes and the fix diff review');
  assert.match(repairStep, /`fix=0`[^\n]*no `exo:fix-review` dispatch/, 'verify skips the fixer when the review holds no fix finding');
  assert.match(verifying, /^Report:[^\n]*report rule[^\n]*three lines[^\n]*`REPORT` path[^\n]*one decision/m, 'verify points to the report rule and ends on one decision');
  assert.match(verifying, /^Report:[^\n]*`question` findings/m, 'question findings stay in the message');
  assert.match(verifying, /^Report:[^\n]*`FAIL`, else `question`, else `ship`/m, 'verify orders the one decision');
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
  assert.match(designTasks, /\$RUN\/files\.md/);
  assert.match(designTasks, /contract-selected\.json/);

  const designingSkill = fs.readFileSync(path.join(skillsRoot, 'design-ui', 'SKILL.md'), 'utf8');
  assert.match(designingSkill, /inventory\.md[^\n]*`exo:survey-ui`|`exo:survey-ui`[^\n]*inventory\.md/);
});

test('the design builder runs with a 60-turn limit, no Agent tool, and scopes foundation and repair, never all', () => {
  const builder = agents.find((agent) => agent.frontmatter.name === 'build-ui');
  assert.ok(builder, 'agents/build-ui.md exists');
  assert.equal(builder.frontmatter.model, undefined);
  assert.equal(Number(builder.frontmatter.maxTurns), 60);
  assert.deepEqual(builder.frontmatter.tools.split(', ').filter((tool) => tool === 'Agent'), []);
  assert.match(builder.body, /`foundation`/);
  assert.match(builder.body, /repair:<surface>/);
  assert.doesNotMatch(builder.body, /`all`/);

  const skillFiles = fs.readdirSync(skillsRoot, { recursive: true })
    .filter((relativePath) => typeof relativePath === 'string');
  assert.deepEqual(skillFiles.filter((relativePath) => relativePath.endsWith('builder-prompt.md')), []);

});

test('the design-ui repair loop drops the 12-call cap for a repair scope with its own report, and QA always dispatches', () => {
  const builder = agents.find((agent) => agent.frontmatter.name === 'build-ui');
  assert.ok(builder, 'agents/build-ui.md exists');
  const repairSection = builder.body.slice(builder.body.indexOf('repair:<surface>'));
  assert.match(repairSection, /faults\.md/);
  assert.match(repairSection, /critic-evidence\.json/);
  assert.match(repairSection, /repair-<surface>\.md/);
  assert.match(repairSection, /renders nothing/);

  const phaseDetail = fs.readFileSync(path.join(skillsRoot, 'design-ui', 'references', 'phase-detail.md'), 'utf8');
  assert.doesNotMatch(phaseDetail, /12 tool calls/);
  assert.match(phaseDetail, /repair:<surface>/);
  assert.match(phaseDetail, /repair-<surface>\.md/);
  assert.match(phaseDetail, /qa\.md/);

  const skill = fs.readFileSync(path.join(skillsRoot, 'design-ui', 'SKILL.md'), 'utf8');
  assert.doesNotMatch(skill, /exo: context/);
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

test('the branch reviewer confirms with one test file or Probe command, never the full suite', () => {
  const reviewer = agents.find((agent) => agent.frontmatter.name === 'review-branch');
  assert.match(reviewer.body, /single test file or `Probe:` command/, 'only a single test file or Probe command');
  for (const banned of ['`verify.mjs`', '`npm run check`', '`npm run validate`', '`npm test`']) {
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

test('build-task reads its brief and lean.md in its first message', () => {
  const implementer = agents.find((agent) => agent.frontmatter.name === 'build-task');
  assert.match(implementer.body, /^- First message: Read brief and `\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/route-skills\/references\/lean\.md` once, never a `<checkout>` copy\.$/m);
});

test('review-branch reads its opening inputs together in its first message', () => {
  const reviewer = agents.find((agent) => agent.frontmatter.name === 'review-branch');
  assert.match(reviewer.body, /^- First message: Read plan `## Goal`, `## Non-goals`, `## Context`, standard, diff and nearest `CLAUDE\.md`\/`AGENTS\.md` together; then changed ranges\.$/m);
});

test('run-unit runs wait-report only after a background Wave: build', () => {
  const unit = agents.find((agent) => agent.frontmatter.name === 'run-unit');
  assert.match(unit.body, /^ {2}- A `Wave:` or `Start:` build runs in the background in a `Slot:` worktree/m);
  assert.match(unit.body, /^ {2}- Then run the printed `Wait:` command, timeout 600000; exit 0 prints fresh reports, each a returned slot\.$/m);
  assert.match(unit.body, /^ {2}- `Next:` stays foreground; its return is the report, no `wait-report\.mjs`\.$/m);
  assert.match(unit.body, /^ {2}- Wait after every landing; exit 2 reruns, at most six runs, then `BLOCKED <n> no report`; never a `sleep` command\.$/m);
});

test('run-unit runs on its own kind, at low effort', () => {
  assert.equal(kindTable.agents['agents/run-unit.md'].kind, 'run-unit');
  assert.deepEqual(kindTable.kinds['run-unit'], { model: 'sonnet', effort: 'low' });
});

test('every skill that cites the report rule names closing.md, which defines it', () => {
  const closing = fs.readFileSync(path.join(skillsRoot, 'route-skills/references/closing.md'), 'utf8');
  assert.match(closing, /^## Report rule$/m, 'closing.md defines the report rule');
  for (const file of ['check-docs/SKILL.md', 'edit-skills/references/skill-shape.md', 'verify/SKILL.md', 'ship/SKILL.md', 'refactor/SKILL.md', 'build/references/tail.md', 'find-cause/SKILL.md', 'design-ui/references/phase-detail.md']) {
    assert.match(fs.readFileSync(path.join(skillsRoot, file), 'utf8'), /closing\.md/, `${file} cites closing.md`);
  }
  for (const owner of ['edit-skills', 'verify', 'ship', 'refactor', 'build', 'design-ui', 'find-cause']) {
    assert.match(fs.readFileSync(path.join(skillsRoot, owner, 'SKILL.md'), 'utf8'), /^\| `\.\.\/route-skills\/references\/closing\.md` \|/m, `${owner} lists closing.md in its References table`);
  }
});

test('every lead wait on a background dispatch bans a wakeup, since a pending one keeps claude -p alive', () => {
  for (const file of ['build/references/run-loop.md', 'build/references/design-tasks.md', 'verify/SKILL.md', 'verify/references/repair.md', 'spec/references/watching.md']) {
    assert.match(fs.readFileSync(path.join(skillsRoot, file), 'utf8'), /ScheduleWakeup[^\n]*Monitor or sleep/, `${file} bans ScheduleWakeup while it waits`);
  }
});

test('only build-task and doc-task hold a retry cell, one level above their on cell', () => {
  const table = JSON.parse(fs.readFileSync(new URL('../lib/model-kinds.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(table.kinds).filter((kind) => table.kinds[kind].retry), ['build-task', 'doc-task']);
  assert.deepEqual(readKindTable(undefined, { retry: true }).kinds['build-task'], { model: 'opus', effort: 'medium' });
  assert.deepEqual(readKindTable(undefined, { retry: true }).kinds['doc-task'], { model: 'sonnet', effort: 'medium' });
  assert.deepEqual(readKindTable(undefined, { retry: true }).kinds.review, kindTable.kinds.review);
});
