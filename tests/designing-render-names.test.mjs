// capture.mjs names each file `<label>-<width>x<height>[-fullpage].png` and
// falls back to the label `capture`, so an unlabeled checkpoint overwrites the
// one before it. The model runs the captures and reads the renders by what the
// designing docs and agents say, so this test guards that text.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const CHECKPOINTS = ['baseline', 'post-build', 'final'];
const LABEL_VALUES = [...CHECKPOINTS, '<checkpoint>'];
const VIEWPORTS = JSON.parse(
  fs.readFileSync(new URL('skills/designing/assets/viewports.json', ROOT), 'utf8')
).capture;

// Mentions that name the script without running it: a prohibition and the
// statement of which render path the skill uses.
const NON_INVOCATIONS = [
  { file: 'skills/designing/references/direction-preview.md', sentence: /^- No `capture\.mjs`/ },
  { file: 'skills/designing/references/phase-detail.md', sentence: /the render path is `scripts\/capture\.mjs` and the critic$/ }
];

function markdownFiles(relativeDirectory) {
  const directory = new URL(`${relativeDirectory}/`, ROOT);
  return fs.readdirSync(directory, { recursive: true })
    .filter((entry) => entry.endsWith('.md'))
    .map((entry) => path.posix.join(relativeDirectory, entry.split(path.sep).join('/')));
}

const DOCS = [
  ...markdownFiles('skills/designing'),
  'agents/design-critic.md',
  'agents/design-discovery.md'
].map((file) => ({ file, text: fs.readFileSync(new URL(file, ROOT), 'utf8') }));

function sentences(text) {
  return text.split('\n').flatMap((line) => line.split(/(?<=[.;:])\s+(?=[A-Z`-])/));
}

test('every capture.mjs invocation in the designing docs names its checkpoint label', () => {
  const labels = new Set();
  for (const { file, text } of DOCS) {
    for (const sentence of sentences(text)) {
      if (!sentence.includes('capture.mjs')) continue;
      const exempt = NON_INVOCATIONS.some((entry) => entry.file === file && entry.sentence.test(sentence.trim().replace(/[.;]$/, '')));
      if (exempt) continue;
      const spans = sentence.match(/`[^`]*capture\.mjs[^`]*`/g) ?? [];
      assert.ok(spans.length > 0, `${file}: a capture.mjs mention outside a code span: ${sentence}`);
      for (const span of spans) {
        const label = span.match(/--label (\S+?)`?(?:\s|$)/)?.[1]?.replace(/`$/, '');
        assert.ok(LABEL_VALUES.includes(label), `${file}: ${span} passes no checkpoint --label`);
        labels.add(label);
      }
    }
  }
  assert.ok(labels.has('<checkpoint>') || CHECKPOINTS.every((name) => labels.has(name)), 'the docs label all three checkpoints');
});

test('the three-checkpoint capture command names every checkpoint label', () => {
  const detail = DOCS.find(({ file }) => file.endsWith('references/phase-detail.md')).text;
  assert.ok(detail.includes('`scripts/capture.mjs --full-page --label <checkpoint> --out "$RUN/renders"`'));
  for (const name of CHECKPOINTS) assert.ok(detail.includes(`\`${name}\``), `phase-detail names the ${name} label`);
});

test('every render file a designing doc reads is one capture.mjs writes', () => {
  const pattern = new RegExp(
    `^(?:\\$RUN/renders/)?(?:${LABEL_VALUES.join('|')})-(?:${VIEWPORTS.join('|')})-fullpage\\.png$`
  );
  let named = 0;
  for (const { file, text } of DOCS) {
    for (const [, name] of text.matchAll(/`([^`\s]*\.png)`/g)) {
      named += 1;
      assert.match(name, pattern, `${file} reads ${name}, which capture.mjs never writes`);
    }
  }
  assert.ok(named > 0, 'the agents name the render files they read');
});
