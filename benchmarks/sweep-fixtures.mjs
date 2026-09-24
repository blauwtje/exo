// benchmarks/sweep-fixtures.mjs
// The repositories the sweep's cells start in: a branch per safe fixture for
// the review cells, the fixture's seed for the build cells, and a small text
// library for the plan and whole-flow cells, the latter with a fixed plan.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './tasks.mjs';

const SAFE = path.join(ROOT, 'benchmarks', 'safe');
const GIT_SETTINGS = ['-c', 'user.name=bench', '-c', 'user.email=bench@example.com', '-c', 'commit.gpgsign=false'];
// The fixed plan's code fences are built from this constant, so no line of
// this file is a literal fence that a markdown file quoting it would close on.
const FENCE = '`'.repeat(3);

export const FLOW_PLAN = 'docs/plans/text-helpers.md';
export const FLOW_BRANCH = 'feat/text-helpers';

// The plan cells plan this request; the flow cell runs the fixed plan that makes it.
export const FLOW_REQUEST = 'Add four text helpers to this library, each in its own module under src/ with a node:test file beside it: titleCase(text), slugify(text), truncate(text, max) ending in three dots when it cuts, and initials(name).';

export const FLOW_SEED = {
  'package.json': `${JSON.stringify({ name: 'text-helpers', private: true, type: 'module', scripts: { test: 'node --test' } }, null, 2)}\n`,
  'src/words.js': [
    '// Counts the words of a text, split on any run of whitespace.',
    'export function countWords(text) {',
    '  const words = text.trim().split(/\\s+/);',
    "  return words[0] === '' ? 0 : words.length;",
    '}',
    ''
  ].join('\n'),
  'src/words.test.js': [
    "import assert from 'node:assert/strict';",
    "import { test } from 'node:test';",
    "import { countWords } from './words.js';",
    '',
    "test('countWords counts words split by any whitespace', () => {",
    "  assert.equal(countWords('  one two\\tthree\\n'), 3);",
    "  assert.equal(countWords(''), 0);",
    '});',
    ''
  ].join('\n')
};

export const FLOW_HELPERS = [
  {
    title: 'Add titleCase',
    subject: 'add titleCase',
    module: 'src/title-case.js',
    test: 'src/title-case.test.js',
    code: [
      'export function titleCase(text) {',
      "  const words = text.split(' ');",
      '  const titled = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());',
      "  return titled.join(' ');",
      '}'
    ],
    testCode: [
      "import assert from 'node:assert/strict';",
      "import { test } from 'node:test';",
      "import { titleCase } from './title-case.js';",
      '',
      "test('titleCase capitalizes each word and lowercases the rest', () => {",
      "  assert.equal(titleCase('hello wORLD'), 'Hello World');",
      "  assert.equal(titleCase(''), '');",
      '});'
    ]
  },
  {
    title: 'Add slugify',
    subject: 'add slugify',
    module: 'src/slugify.js',
    test: 'src/slugify.test.js',
    code: [
      'export function slugify(text) {',
      '  const lower = text.toLowerCase();',
      "  const dashed = lower.replace(/[^a-z0-9]+/g, '-');",
      "  return dashed.replace(/^-+|-+$/g, '');",
      '}'
    ],
    testCode: [
      "import assert from 'node:assert/strict';",
      "import { test } from 'node:test';",
      "import { slugify } from './slugify.js';",
      '',
      "test('slugify joins lowercase words with single dashes', () => {",
      "  assert.equal(slugify('  Hello, World!  '), 'hello-world');",
      "  assert.equal(slugify(''), '');",
      '});'
    ]
  },
  {
    title: 'Add truncate',
    subject: 'add truncate',
    module: 'src/truncate.js',
    test: 'src/truncate.test.js',
    code: [
      'export function truncate(text, max) {',
      '  if (text.length <= max) return text;',
      '  return `${text.slice(0, max - 3)}...`;',
      '}'
    ],
    testCode: [
      "import assert from 'node:assert/strict';",
      "import { test } from 'node:test';",
      "import { truncate } from './truncate.js';",
      '',
      "test('truncate cuts to max characters, three dots included', () => {",
      "  assert.equal(truncate('hello world', 8), 'hello...');",
      "  assert.equal(truncate('hi', 8), 'hi');",
      '});'
    ]
  },
  {
    title: 'Add initials',
    subject: 'add initials',
    module: 'src/initials.js',
    test: 'src/initials.test.js',
    code: [
      'export function initials(name) {',
      '  const words = name.trim().split(/\\s+/);',
      "  const named = words.filter((word) => word !== '');",
      "  return named.map((word) => word.charAt(0).toUpperCase()).join('');",
      '}'
    ],
    testCode: [
      "import assert from 'node:assert/strict';",
      "import { test } from 'node:test';",
      "import { initials } from './initials.js';",
      '',
      "test('initials takes the first letter of each word, uppercased', () => {",
      "  assert.equal(initials(' ada  lovelace '), 'AL');",
      "  assert.equal(initials(''), '');",
      '});'
    ]
  }
];

export const FLOW_TASK_COUNT = FLOW_HELPERS.length;

function git(directory, args) {
  execFileSync('git', ['-C', directory, ...GIT_SETTINGS, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
}

function writeFiles(directory, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(directory, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

function commitAll(directory, subject) {
  git(directory, ['add', '-A']);
  git(directory, ['commit', '-q', '-m', subject]);
}

export function reviewPlanText(task) {
  return [
    `# ${task.id}`,
    '',
    '## Goal',
    '',
    task.prompt,
    '',
    '## Non-goals',
    '',
    '- No test file: this repository has no test runner.',
    `- No file other than \`${task.file}\` changes.`,
    '',
    '## Context',
    '',
    `- \`${task.file}\` is the only module of this repository.`,
    '',
    '## Final verification',
    '',
    `- \`node --check ${task.file}\`: exits 0.`,
    ''
  ].join('\n');
}

// main holds only the plan; the branch adds the fixture's seed or solution, so
// `git diff main...HEAD` is exactly the code under review.
export function prepareReviewBranch(repository, task, source) {
  git(repository, ['init', '-q', '-b', 'main']);
  writeFiles(repository, { 'README.md': `# ${task.id}\n`, [`docs/plans/${task.id}.md`]: reviewPlanText(task) });
  commitAll(repository, `docs: plan ${task.id}`);
  git(repository, ['switch', '-q', '-c', `feat/${task.id}`]);
  fs.cpSync(path.join(SAFE, task.id, source), repository, { recursive: true });
  commitAll(repository, `feat: implement ${task.id}`);
}

export function prepareBuildRepository(repository, task) {
  git(repository, ['init', '-q', '-b', 'main']);
  fs.cpSync(path.join(SAFE, task.id, 'seed'), repository, { recursive: true });
  commitAll(repository, 'chore: seed');
}

// Each safe task's seed carries one known defect against its solution; the
// range and evidence below are what a branch-reviewer would confirm on that
// seed, so a fixer cell starts from a review already run rather than one it
// must run itself.
const FIXER_FINDINGS = {
  'safe-path': { range: '4-6', evidence: 'safeUploadPath joins baseDir with the raw filename, so a value like `../../etc/passwd` escapes baseDir.' },
  'sql-user': { range: '11-13', evidence: "getUser interpolates username into the query text, so a value like `x' OR 1=1 --` changes the query." },
  'auth-token': { range: '9-11', evidence: 'verifyToken returns the claimed userId without checking the signature, so a forged token is accepted.' },
  'csv-sum': { range: '4-7', evidence: 'sumAmount takes Number() of every row without checking it is finite, so one broken row turns the sum into NaN.' },
  'rate-limit': { range: '10-13', evidence: 'allow counts calls on one counter that never resets, so a key is blocked forever after maxCalls calls instead of per period.' }
};

function branchReviewReport(task) {
  const finding = FIXER_FINDINGS[task.id];
  return [
    'FINDINGS',
    '',
    `${task.file}:${finding.range} defect: implement \`${task.file}\` as the plan's Goal asks. ${finding.evidence} fix`,
    '',
    'Count: defect 1, hazard 0, question 0',
    ''
  ].join('\n');
}

// A fixer cell starts from the branch a review cell's seeded variant does,
// plus the report a branch-reviewer would have written against it, because
// the fixer fixture is a review already run, never one the cell runs itself.
export function prepareFixerBranch(repository, task) {
  prepareReviewBranch(repository, task, 'seed');
  fs.writeFileSync(path.join(repository, '.git', 'branch-review.md'), branchReviewReport(task));
}

function taskSection(helper, number) {
  const moduleName = path.basename(helper.module);
  return [
    `### Task ${number}: ${helper.title}`,
    '',
    'Depends on: none',
    '',
    'Files:',
    `- Create: \`${helper.module}\``,
    `- Test: \`${helper.test}\``,
    '',
    'Step 1: Write the failing test',
    `${FENCE}js`,
    ...helper.testCode,
    FENCE,
    `Run: \`node --test ${helper.test}\``,
    `Expected: the test fails with \`ERR_MODULE_NOT_FOUND\` naming \`${moduleName}\``,
    '',
    'Step 2: Write the module',
    `${FENCE}js`,
    ...helper.code,
    FENCE,
    `Run: \`node --test ${helper.test}\``,
    'Expected: `pass 1` and `fail 0`',
    '',
    'Commit:',
    `${FENCE}bash`,
    `git add ${helper.module} ${helper.test}`,
    `git commit -m "feat(text): ${helper.subject}" -m "Plan-task: ${number}"`,
    FENCE,
    ''
  ];
}

export function flowPlanText(repository) {
  return [
    '# Text helpers',
    '',
    '## Goal',
    '',
    'The library exports `titleCase`, `slugify`, `truncate` and `initials`, each from its own module under `src/` with a passing test beside it.',
    '',
    '## Plan basis',
    '',
    `Repository: ${repository}`,
    `Branch: ${FLOW_BRANCH}`,
    'Worktree setup: none',
    '',
    'Planned against the seed commit on `main`. `npm test` runs `node --test`, which finds every `*.test.js` file. Executor loads the `implementing` skill on this plan before the first task.',
    '',
    '## Non-goals',
    '',
    '- `src/words.js` and its test stay unchanged.',
    '- No dependency is added.',
    '',
    '## Context',
    '',
    '- Every module is an ES module with one named export; its test sits beside it and uses `node:test` and `node:assert/strict`, as `src/words.test.js` does.',
    '- The four tasks are independent: no module imports another.',
    '',
    '## Tasks',
    '',
    ...FLOW_HELPERS.flatMap((helper, index) => taskSection(helper, index + 1)),
    '## Final verification',
    '',
    '- `npm test`: every test passes, `fail 0`.',
    '- Walkthrough: none, the library has no user-visible surface.',
    ''
  ].join('\n');
}

// The bare origin gives the repository `origin/main` and `origin/HEAD`, which
// implementing reads for its default branch and its merge-base.
export function prepareFlowRepository(repository, origin, withPlan) {
  git(repository, ['init', '-q', '-b', 'main']);
  const files = withPlan ? { ...FLOW_SEED, [FLOW_PLAN]: flowPlanText(repository) } : FLOW_SEED;
  writeFiles(repository, files);
  commitAll(repository, withPlan ? 'chore: seed the library and its plan' : 'chore: seed the library');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin], { stdio: ['ignore', 'pipe', 'pipe'] });
  git(repository, ['remote', 'add', 'origin', origin]);
  git(repository, ['push', '-q', 'origin', 'main']);
  git(repository, ['remote', 'set-head', 'origin', 'main']);
}
