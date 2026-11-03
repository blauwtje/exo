import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const agentsRoot = path.join(repositoryRoot, 'agents');
const skillsRoot = path.join(repositoryRoot, 'skills');

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

test('every agent a skill dispatches has a file, and every agent file is dispatched', () => {
  const dispatched = new Set([...skillMarkdown().matchAll(/`exo:([a-z-]+)` agent/g)].map((match) => match[1]));
  const defined = new Set(agents.map((agent) => agent.frontmatter.name));
  assert.deepEqual([...dispatched].filter((name) => !defined.has(name)), [], 'a skill dispatches an agent with no file');
  assert.deepEqual([...defined].filter((name) => !dispatched.has(name)), [], 'an agent file no skill dispatches');
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
