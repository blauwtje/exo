
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { memoryDirectory } from '#memory-store';
import {
  compactPlanFixture, compactTask as plainCompactTask, git, gitRepository, planFixture, run,
  taskSection as plainTaskSection
} from './harness.mjs';

export const compactTask = (options) => `${plainCompactTask(options)} | Red: none (fixture)`;

export const CHANGED = '! pwd | grep -q red-green-';

export const taskSection = (options) => plainTaskSection(options).replace('Run: `node --test`', `Run: \`${CHANGED}\``);

export const SCRIPT = fileURLToPath(new URL('../skills/build/scripts/land-task.mjs', import.meta.url));

export const cacheFile = (root) => path.join(memoryDirectory(root), 'check-cache.json');

export const PLAN = planFixture({ tasks: [
  taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' }),
  taskSection({ number: 2, title: 'No trailer', files: ['- Create: `src/none.js`'], subject: 'feat(app): none', trailer: false }),
  taskSection({ number: 3, title: 'No block', files: ['- Create: `src/none.js`'], subject: 'feat(app): none', commit: false }),
  taskSection({ number: 4, title: 'Two files', files: ['- Modify: `src/app.js`', '- Create: `src/note.md`'], subject: 'feat(app): two files' })
] });

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

export const withGate = (plan, command) => plan.replace('Branch: feat/fixture', `Branch: feat/fixture\nLand gate: ${command}`);

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

const APP_PROOF = [
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
  await fs.appendFile(path.join(root, '.git/info/exclude'), '.exo/\n');
  await editApp(root);
  return { root, planPath: path.join(root, 'docs/plans/compact.md') };
}

export async function writeReport(root, text) {
  await fs.mkdir(path.join(root, '.exo'), { recursive: true });
  await fs.writeFile(path.join(root, '.exo/implementer-1.md'), text);
}

export async function assertRefused(root, planPath, stderrPattern) {
  const head = git(root, 'rev-parse', 'HEAD');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 1, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, stderrPattern);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
  assert.match(git(root, 'status', '--porcelain'), /src\/app\.js/);
}
