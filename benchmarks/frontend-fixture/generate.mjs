import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FIXTURE_NAME = 'flow-web';
const REACT_RANGE = '^18.3.0';

export const PROFILES = {
  small: { modules: 10, casesPerModule: 10 },
  full: { modules: 60, casesPerModule: 40 },
};

const here = path.dirname(fileURLToPath(import.meta.url));

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function write(root, relative, text) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
}

function moduleSource(index, random) {
  const factor = 1 + Math.floor(random() * 9);
  return `export const scale${index} = (value) => value * ${factor};\nexport const label${index} = (value) => \`item-\${scale${index}(value)}\`;\n`;
}

function moduleTest(index, cases) {
  const lines = [`import assert from 'node:assert/strict';`, `import test from 'node:test';`, `import { label${index}, scale${index} } from '../src/lib/mod${index}.mjs';`];
  for (let n = 1; n <= cases; n += 1) {
    lines.push(`test('mod${index} case ${n}', () => {`, `  assert.equal(label${index}(${n}), \`item-\${scale${index}(${n})}\`);`, `});`);
  }
  return `${lines.join('\n')}\n`;
}

function flakeTest(seed) {
  return `import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const countFile = new URL('../.flake-count', import.meta.url);

test('flaky sync badge', () => {
  const runs = fs.existsSync(countFile) ? Number(fs.readFileSync(countFile, 'utf8')) : 0;
  fs.writeFileSync(countFile, String(runs + 1));
  assert.notEqual((runs * 7 + ${seed}) % 5, 0);
});
`;
}

const REVIEW_SOURCE = `import { useEffect, useState } from 'react';
import { sortItems } from '../lib/sort.mjs';

export function Review({ items, load }) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    load().then((loaded) => setRows(sortItems(loaded)));
  }, []);

  return (
    <ul>
      {rows.map((row) => (
        <li key={row.id} dangerouslySetInnerHTML={{ __html: row.title }} />
      ))}
    </ul>
  );
}
`;

const PAGINATE_SOURCE = `export function pageCount(total, size) {
  return Math.floor(total / size) + (total % size <= 0 ? 0 : 1);
}
export const pageOf = (items, page, size) => items.slice(page * size, (page + 1) * size);
`;

const SORT_SOURCE = `export const sortItems = (items) => [...items].sort((a, b) => a.title.localeCompare(b.title));\n`;

export function generate({ out, profile = 'small', seed = 1 }) {
  const knobs = PROFILES[profile];
  if (!knobs) throw new Error(`unknown profile ${profile}`);
  const random = seededRandom(seed);
  write(out, 'package.json', `${JSON.stringify({ name: FIXTURE_NAME, private: true, type: 'module', scripts: { dev: 'vite', build: 'vite build', test: 'node --test tests/*.test.mjs' }, dependencies: { react: REACT_RANGE, 'react-dom': REACT_RANGE }, devDependencies: { vite: '^5.4.0', '@vitejs/plugin-react': '^4.3.0' } }, null, 2)}\n`);
  write(out, 'vite.config.mjs', `import react from '@vitejs/plugin-react';\nimport { defineConfig } from 'vite';\n\nexport default defineConfig({ plugins: [react()] });\n`);
  write(out, 'index.html', '<!doctype html>\n<div id="root"></div>\n<script type="module" src="/src/main.jsx"></script>\n');
  write(out, 'src/main.jsx', `import { createRoot } from 'react-dom/client';\nimport { Review } from './features/Review.jsx';\n\ncreateRoot(document.getElementById('root')).render(<Review items={[]} load={async () => []} />);\n`);
  write(out, 'src/features/Review.jsx', REVIEW_SOURCE);
  write(out, 'src/features/paginate.mjs', PAGINATE_SOURCE);
  write(out, 'src/lib/sort.mjs', SORT_SOURCE);
  for (let index = 0; index < knobs.modules; index += 1) {
    write(out, `src/lib/mod${index}.mjs`, moduleSource(index, random));
    write(out, `tests/mod${index}.test.mjs`, moduleTest(index, knobs.casesPerModule));
  }
  write(out, 'tests/flake.test.mjs', flakeTest(seed));
  fs.copyFileSync(path.join(here, 'task.md'), path.join(out, 'TASK.md'));
  fs.copyFileSync(path.join(here, 'defects.json'), path.join(out, 'defects.json'));
  return { tests: knobs.modules * knobs.casesPerModule + 1 };
}

function option(name, fallback) {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? fallback : process.argv[at + 1];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = option('out');
  if (!out) {
    console.error('usage: generate.mjs --profile small|full --out <dir> [--seed n]');
    process.exit(2);
  }
  const summary = generate({ out: path.resolve(out), profile: option('profile', 'small'), seed: Number(option('seed', 1)) });
  console.log(`generated ${summary.tests} tests in ${out}`);
}
