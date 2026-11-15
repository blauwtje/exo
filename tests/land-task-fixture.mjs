
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { memoryDirectory } from '#config-directory';
import { compactPlanFixture, compactTask as plainCompactTask, git, gitRepository } from './harness.mjs';

export const compactTask = (options) => `${plainCompactTask(options)} | Red: none (fixture)`;

export const CHANGED = '! pwd | grep -q red-green-';

export const SCRIPT = fileURLToPath(new URL('../skills/build/scripts/land-task.mjs', import.meta.url));

export const cacheFile = (root) => path.join(memoryDirectory(root), 'check-cache.json');

export const PLAN = compactPlanFixture({ tasks: [
  plainCompactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: CHANGED }),
  plainCompactTask({ number: 4, title: 'feat(app): two files', dependsOn: '1', files: ['src/app.js', 'src/note.md'], proof: CHANGED })
] }).replace('## Tasks', '## Non-goals\n- `src/other.js` stays as it is.\n\n## Tasks');

const LANDED_REPORT = 'Landed: the change\nUnresolved: none\n';

export async function landingCheckout() {
  const root = await gitRepository({ 'src/app.js': 'export function greet() {}\n', 'docs/plans/fixture.md': PLAN });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'config', 'commit.gpgsign', 'false');
  await fs.appendFile(path.join(root, '.git/info/exclude'), '.exo/\n');
  await fs.mkdir(path.join(root, '.exo'), { recursive: true });
  await fs.writeFile(path.join(root, '.exo/implementer-1.md'), LANDED_REPORT);
  await fs.writeFile(path.join(root, '.exo/implementer-4.md'), LANDED_REPORT);
  return { root, planPath: path.join(root, 'docs/plans/fixture.md') };
}

export async function editApp(root) {
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() {\n  return "hello";\n}\n');
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
