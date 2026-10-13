// Fixtures the land-task*.test.mjs files share: plans, checkouts and build reports
// that land-task.mjs reads.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { memoryDirectory } from '#memory-store';
import {
  compactPlanFixture, compactTask as plainCompactTask, git, gitRepository, planFixture, run,
  taskSection as plainTaskSection
} from './harness.mjs';

// These fixtures' Proofs pass on their base, so each names `Red: none` and the red gate stays out of the way.
export const compactTask = (options) => `${plainCompactTask(options)} | Red: none (fixture)`;

// A long-format task has no `Red:` field, so its Run: command must fail in the temporary
// red-green-* worktree the red check runs in, and pass in the fixture checkout.
export const CHANGED = '! pwd | grep -q red-green-';

export const taskSection = (options) => plainTaskSection(options).replace('Run: `node --test`', `Run: \`${CHANGED}\``);

export const SCRIPT = fileURLToPath(new URL('../skills/build/scripts/land-task.mjs', import.meta.url));

// The check cache lives in the repository's common git directory, shared by its worktrees.
export const cacheFile = (root) => path.join(memoryDirectory(root), 'check-cache.json');

export const PLAN = planFixture({ tasks: [
  taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' }),
  taskSection({ number: 2, title: 'No trailer', files: ['- Create: `src/none.js`'], subject: 'feat(app): none', trailer: false }),
  taskSection({ number: 3, title: 'No block', files: ['- Create: `src/none.js`'], subject: 'feat(app): none', commit: false }),
  taskSection({ number: 4, title: 'Two files', files: ['- Modify: `src/app.js`', '- Create: `src/note.md`'], subject: 'feat(app): two files' })
] });

// The block runs `git commit` outside the harness's `git()`, so the fixture
// repository carries its own identity and no signing.
export async function landingCheckout() {
  const root = await gitRepository({ 'src/app.js': 'export function greet() {}\n', 'docs/plans/fixture.md': PLAN });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  return { root, planPath: path.join(root, 'docs/plans/fixture.md') };
}

export async function editApp(root) {
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() {\n  return "hello";\n}\n');
}

export function withLint(command) {
  return PLAN.replace('Branch: feat/fixture', `Branch: feat/fixture\nLint: ${command}`);
}

export const COMPACT_PLAN = compactPlanFixture({ tasks: [
  compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: 'node tests/app.test.mjs' })
] });

export const PASS_REPORT = [
  'Landed: src/app.js',
  'Proof:',
  '- `node tests/app.test.mjs`: pass',
  '  # pass 3',
  '  # fail 0',
  'Unresolved: none',
  ''
].join('\n');

// The Proof land-task runs: a plain script, since a nested `node --test`
// inherits this runner's NODE_TEST_CONTEXT and exits 0 whatever it ran.
export const APP_PROOF = [
  "import { greet } from '../src/app.js';",
  "if (greet() !== 'hello') {",
  "  console.log('# pass 2');",
  "  console.error(`✖ greet returns \"hello\", got \"${greet()}\"`);",
  '  process.exit(1);',
  '}',
  "console.log('# pass 3');",
  "console.log('# fail 0');",
  ''
].join('\n');

export async function compactCheckout(plan = COMPACT_PLAN) {
  const root = await gitRepository({
    'src/app.js': 'export function greet() {}\n',
    'docs/plans/compact.md': plan,
    'package.json': '{ "type": "module" }\n',
    'tests/app.test.mjs': APP_PROOF,
    'tests/greet.test.mjs': "console.log('# pass 1');\n"
  });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  await fs.appendFile(path.join(root, '.git/info/exclude'), '.exo/\n'); // as in a real checkout
  await editApp(root);
  return { root, planPath: path.join(root, 'docs/plans/compact.md') };
}

export async function writeReport(root, text) {
  await fs.mkdir(path.join(root, '.exo'), { recursive: true });
  await fs.writeFile(path.join(root, '.exo/implementer-1.md'), text);
}

// Not done without proof: each refusal exits 1 before the commit runs, so HEAD
// and the edit stay as the build left them.
export async function assertRefused(root, planPath, extraArgs, stderrPattern) {
  const head = git(root, 'rev-parse', 'HEAD');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root, ...extraArgs], { cwd: root });
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, stderrPattern);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
  assert.match(git(root, 'status', '--porcelain'), /src\/app\.js/);
}

// An older compact plan names no `Proof:`, so build-task writes or picks one
// test for the Success criterion; that test's pass line is the proof.
export const OLDER_PLAN = compactPlanFixture({ tasks: [
  compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: null })
] });

// The builder holds no MCP tool, so a `Proof: mcp:<tool> <args>` task lands on
// the report's `<command>: deferred` line and names the proof as pending for
// the session.
export const MCP_PLAN = compactPlanFixture({ tasks: [
  compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: 'mcp:run_playtest mode=play' })
] });
