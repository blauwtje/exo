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
];
const KNOWN_TOOLS = [
  'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Agent', 'WebFetch', 'WebSearch', 'NotebookEdit', 'Skill',
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

function agentKind(name) {
  return kindTable.kinds[kindTable.agents[`agents/${name}.md`].kind];
}

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

test('every agent is named after its file', () => {
  for (const agent of agents) {
    assert.equal(`${agent.frontmatter.name}.md`, agent.fileName);
  }
});

test('every agent pins the model and effort its kind resolves to, and no effort when the kind sets none', () => {
  for (const agent of agents) {
    const { model, effort } = agentKind(agent.frontmatter.name);
    assert.equal(agent.frontmatter.model, model, `${agent.fileName} model`);
    assert.equal(agent.frontmatter.effort, effort ?? undefined, `${agent.fileName} effort`);
  }
});

test('an agent on the fast tier pins no effort, because the fast model takes none', () => {
  const fastModel = kindTable.providers[kindTable.provider].tiers.fast;
  for (const agent of agents) {
    if (agent.frontmatter.model !== fastModel) continue;
    assert.equal(agent.frontmatter.effort, undefined, `${agent.fileName} pins effort on ${fastModel}`);
  }
});

const NO_DELETE = 'Never delete a file, container, volume, database, branch or credential to get past a blocked state: that state is evidence and the data behind it is often the only copy. Report the situation with two or three options instead.';

test('every agent that loads no CLAUDE.md carries the no-delete rule itself', () => {
  const missing = agents
    .filter((agent) => agent.frontmatter.omitClaudeMd === 'true')
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
  assert.deepEqual(explorer.frontmatter.tools.split(', ').filter((tool) => ['Write', 'Edit', 'Agent'].includes(tool)), []);
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
  assert.equal(source.frontmatter.model, 'opus');
  assert.match(source.body, /carry out the prompt you are handed/i);
  assert.ok(agents.find((agent) => agent.frontmatter.name === 'review-branch').body.includes('the findings path the dispatch names'), 'the dispatch names the findings path');
});

test('a branch reviewer reads and reports: no edit tool, no fix, no final verification, one return line', () => {
  const reviewer = agents.find((agent) => agent.frontmatter.name === 'review-branch');
  assert.ok(reviewer.frontmatter.tools, 'the reviewer lists its tools');
  assert.deepEqual(reviewer.frontmatter.tools.split(', ').filter((tool) => ['Edit', 'NotebookEdit', 'Agent'].includes(tool)), []);
  assert.doesNotMatch(reviewer.frontmatter.description, /\bfix|final verification/i);
  assert.doesNotMatch(reviewer.body, /run every Final verification|`fixed` or `reported`|`FIXED`/);
  assert.ok(reviewer.body.includes('`verdict=CLEAN|FINDINGS|BLOCKED defect=<n> hazard=<n> question=<n> fix=<n> report=<path>`'), 'the reviewer returns one verdict line with its fix count');
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
  const order = ["Rerun step 1's `verify.mjs`", 'run-probes.mjs', 'the scope `fix diff`', 'land-task.mjs" --fix'].map((text) => repairAfter.indexOf(text));
  assert.ok(order.every((index, position) => index !== -1 && (position === 0 || index > order[position - 1])), 'verify reruns the gate, then the probes, then reviews the fix diff, before the fix commit');
  assert.ok(repairAfter.includes('a `FAIL` or `STRAY` line ends the turn'), 'verify stops on a FAIL or STRAY line after the rerun');
  assert.ok(repairAfter.includes('a `FAIL probe` line ends the turn'), 'verify stops on a failing probe');
  assert.match(repairStep, /`fix=0`[^\n]*no `exo:fix-review` dispatch/, 'verify skips the fixer when the review holds no fix finding');
  assert.match(verifying, /^Report:[^\n]*each `report` finding, each `question` as a plan question naming its task and any breaking input/m, 'verify reports every report finding and each question as a plan question, whatever the fix count');
  assert.ok(fixerPrompt.includes('run the `Run:` command, else the `Proof:` command, of every plan task'), 'the fixer falls back to Proof: for a compact task');
  assert.ok(fixerPrompt.includes("grep -nE 'Files:|Proof:|Run:'"), 'the fixer finds Files:, Proof: and Run: unanchored');
});

test('the implementer pins its kind\'s model and effort whatever the session runs at', () => {
  const implementer = agents.find((agent) => agent.frontmatter.name === 'build-task');
  assert.ok(implementer, 'agents/build-task.md exists');
  assert.equal(implementer.frontmatter.model, agentKind('build-task').model);
  assert.equal(implementer.frontmatter.effort, agentKind('build-task').effort);
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
  assert.equal(builder.frontmatter.model, agentKind('build-ui').model);
  assert.equal(Number(builder.frontmatter.maxTurns), 60);
  assert.deepEqual(builder.frontmatter.tools.split(', ').filter((tool) => tool === 'Agent'), []);
  assert.match(builder.body, /`foundation`/);
  assert.match(builder.body, /repair:<surface>/);
  assert.doesNotMatch(builder.body, /`all`/);

  const skillFiles = fs.readdirSync(skillsRoot, { recursive: true })
    .filter((relativePath) => typeof relativePath === 'string');
  assert.deepEqual(skillFiles.filter((relativePath) => relativePath.endsWith('builder-prompt.md')), []);

  const budgets = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'lib/delegate-budgets.json'), 'utf8'));
  assert.equal(budgets.agents['exo:build-ui'].calls, 60);
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
