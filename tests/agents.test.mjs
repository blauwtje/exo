// A plugin agent's frontmatter is read by the harness, not by the model, so a
// wrong key, a turn budget that disagrees with its limit or a script flag that
// does not exist fails silently in a real run. These checks hold the agent
// files to what the harness and the scripts accept, without dispatching one.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const agentsRoot = path.join(repositoryRoot, 'agents');
const skillsRoot = path.join(repositoryRoot, 'skills');

// The keys code.claude.com/docs/en/plugins-reference lists for a plugin agent.
const SUPPORTED_KEYS = [
  'name', 'description', 'model', 'effort', 'maxTurns', 'tools',
  'disallowedTools', 'skills', 'memory', 'background', 'omitClaudeMd', 'isolation',
];
const KNOWN_TOOLS = [
  'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Agent', 'WebFetch', 'WebSearch', 'NotebookEdit',
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

test('an agent on haiku pins no effort, which that model does not take', () => {
  for (const agent of agents) {
    if (agent.frontmatter.model !== 'haiku') continue;
    assert.equal(agent.frontmatter.effort, undefined, `${agent.fileName} pins effort on haiku`);
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
  const explorer = agents.find((agent) => agent.frontmatter.name === 'explorer');
  const critic = agents.find((agent) => agent.frontmatter.name === 'design-critic');
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
      const scriptPath = path.join(skillsRoot, 'designing', 'scripts', scriptName);
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
      assert.ok(fs.existsSync(path.join(skillsRoot, 'designing', relativePath)), `${agent.fileName} reads a missing ${relativePath}`);
    }
  }
});

test('every agent a skill dispatches has a file, and every agent file is dispatched', () => {
  const dispatched = new Set([...skillMarkdown().matchAll(/`exo:([a-z-]+)` agent/g)].map((match) => match[1]));
  const defined = new Set(agents.map((agent) => agent.frontmatter.name));
  assert.deepEqual([...dispatched].filter((name) => !defined.has(name)), [], 'a skill dispatches an agent with no file');
  assert.deepEqual([...defined].filter((name) => !dispatched.has(name)), [], 'an agent file no skill dispatches');
});

test('the inputs the design critic expects are the ones designing hands it', () => {
  const critic = agents.find((agent) => agent.frontmatter.name === 'design-critic');
  const dispatchText = fs.readFileSync(path.join(skillsRoot, 'designing', 'references', 'phase-detail.md'), 'utf8');
  for (const input of ['`RUN`', '`SKILL`']) {
    assert.ok(critic.body.includes(input), `the critic does not expect ${input}`);
    assert.ok(dispatchText.includes(input), `phase-detail.md does not hand over ${input}`);
  }
});

test('the two branch reviewers share one body and differ only in effort', () => {
  const reviewer = agents.find((agent) => agent.frontmatter.name === 'branch-reviewer');
  const deepReviewer = agents.find((agent) => agent.frontmatter.name === 'branch-reviewer-deep');
  assert.ok(deepReviewer, 'agents/branch-reviewer-deep.md exists');
  assert.equal(reviewer.frontmatter.effort, 'medium');
  assert.equal(deepReviewer.frontmatter.effort, 'high');
  assert.equal(deepReviewer.body, reviewer.body, 'the two bodies differ');
  assert.deepEqual(Object.keys(deepReviewer.frontmatter).sort(), Object.keys(reviewer.frontmatter).sort());
  const sharedKeys = Object.keys(reviewer.frontmatter).filter((key) => !['name', 'description', 'effort'].includes(key));
  for (const key of sharedKeys) {
    assert.equal(deepReviewer.frontmatter[key], reviewer.frontmatter[key], `${key} differs between the two reviewers`);
  }
});

test('a branch reviewer reads and reports: no edit tool, no fix, no final verification, one return line', () => {
  const reviewer = agents.find((agent) => agent.frontmatter.name === 'branch-reviewer');
  assert.ok(reviewer.frontmatter.tools, 'the reviewer lists its tools');
  assert.deepEqual(reviewer.frontmatter.tools.split(', ').filter((tool) => ['Edit', 'NotebookEdit', 'Agent'].includes(tool)), []);
  assert.doesNotMatch(reviewer.frontmatter.description, /\bfix|final verification/i);
  assert.doesNotMatch(reviewer.body, /run every Final verification|`fixed` or `reported`|`FIXED`/);
  assert.ok(reviewer.body.includes('`verdict=CLEAN|FINDINGS|BLOCKED defect=<n> hazard=<n> question=<n> report=<path>`'), 'the reviewer returns one verdict line');
});

test('implementing sends a FINDINGS review to a sonnet fixer from review-fixer-prompt.md', () => {
  const fixerPath = path.join(skillsRoot, 'implementing', 'review-fixer-prompt.md');
  assert.ok(fs.existsSync(fixerPath), 'skills/implementing/review-fixer-prompt.md exists');
  const fixerPrompt = fs.readFileSync(fixerPath, 'utf8');
  assert.ok(fixerPrompt.includes('`fixed=<n> reported=<n> report=<path>`'), 'the fixer returns one count line');
  assert.match(fixerPrompt, /`general-purpose` delegate on `sonnet`/);
  const implementing = fs.readFileSync(path.join(skillsRoot, 'implementing', 'SKILL.md'), 'utf8');
  assert.match(implementing, /`FINDINGS`[^\n]*`review-fixer-prompt\.md`/);
  assert.match(implementing, /\| `review-fixer-prompt\.md` \|/);
});

test('the implementer pins sonnet at high effort whatever the session runs at', () => {
  const implementer = agents.find((agent) => agent.frontmatter.name === 'implementer');
  assert.ok(implementer, 'agents/implementer.md exists');
  assert.equal(implementer.frontmatter.model, 'sonnet');
  assert.equal(implementer.frontmatter.effort, 'high');
  assert.equal(implementer.frontmatter.omitClaudeMd, undefined, 'the implementer reads CLAUDE.md');
});

test('a Design: task with a named direction stays in the implementing session, not the implementer', () => {
  const implementer = agents.find((agent) => agent.frontmatter.name === 'implementer');
  assert.ok(implementer, 'agents/implementer.md exists');
  assert.doesNotMatch(implementer.body, /enter it at its Build phase/);
  assert.doesNotMatch(implementer.frontmatter.description, /opus/);

  const designTasksPath = path.join(skillsRoot, 'implementing', 'references', 'design-tasks.md');
  const designTasks = fs.readFileSync(designTasksPath, 'utf8');
  assert.doesNotMatch(designTasks, /exo:implementer/);
  assert.match(designTasks, /\$RUN\/files\.md/);
  assert.match(designTasks, /contract-selected\.json/);

  const designingSkill = fs.readFileSync(path.join(skillsRoot, 'designing', 'SKILL.md'), 'utf8');
  assert.match(designingSkill, /inventory\.md[^\n]*`exo:design-discovery`|`exo:design-discovery`[^\n]*inventory\.md/);
});

test('the design builder runs on sonnet with a 35-turn limit, no Agent tool, and scopes foundation and repair, never all', () => {
  const builder = agents.find((agent) => agent.frontmatter.name === 'design-builder');
  assert.ok(builder, 'agents/design-builder.md exists');
  assert.equal(builder.frontmatter.model, 'sonnet');
  assert.equal(Number(builder.frontmatter.maxTurns), 35);
  assert.deepEqual(builder.frontmatter.tools.split(', ').filter((tool) => tool === 'Agent'), []);
  assert.match(builder.body, /`foundation`/);
  assert.match(builder.body, /repair:<surface>/);
  assert.doesNotMatch(builder.body, /`all`/);

  const skillFiles = fs.readdirSync(skillsRoot, { recursive: true })
    .filter((relativePath) => typeof relativePath === 'string');
  assert.deepEqual(skillFiles.filter((relativePath) => relativePath.endsWith('builder-prompt.md')), []);

  const budgets = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'skills/savings/assets/delegate-budgets.json'), 'utf8'));
  assert.equal(budgets.agents['design-builder'].calls, 35);
});

test('the designing repair loop drops the 12-call cap for a repair scope with its own report, and QA always dispatches', () => {
  const builder = agents.find((agent) => agent.frontmatter.name === 'design-builder');
  assert.ok(builder, 'agents/design-builder.md exists');
  const repairSection = builder.body.slice(builder.body.indexOf('repair:<surface>'));
  assert.match(repairSection, /faults\.md/);
  assert.match(repairSection, /critic-evidence\.json/);
  assert.match(repairSection, /repair-<surface>\.md/);
  assert.match(repairSection, /renders nothing/);

  const phaseDetail = fs.readFileSync(path.join(skillsRoot, 'designing', 'references', 'phase-detail.md'), 'utf8');
  assert.doesNotMatch(phaseDetail, /12 tool calls/);
  assert.match(phaseDetail, /repair:<surface>/);
  assert.match(phaseDetail, /repair-<surface>\.md/);
  assert.match(phaseDetail, /qa\.md/);

  const skill = fs.readFileSync(path.join(skillsRoot, 'designing', 'SKILL.md'), 'utf8');
  assert.doesNotMatch(skill, /exo: context/);
});
