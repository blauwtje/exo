import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { POOL } from './pool.mjs';

const IDENT = 'Dana Keller <dana@example.test>';
const START_SECONDS = Date.UTC(2024, 1, 5, 9, 0, 0) / 1000;
const MIN_STEP_SECONDS = 20 * 60;
const MAX_STEP_SECONDS = 30 * 60 * 60;
const GIT_ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };

export function edit(files, path, from, to) {
  const text = files[path];
  if (text === undefined) throw new Error(`missing file ${path}`);
  const next = text.replace(from, () => to);
  if (next === text) throw new Error(`no change for ${String(from)} in ${path}`);
  files[path] = next;
}

export function append(files, path, text) {
  files[path] = (files[path] ?? '') + text;
}

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, next) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function kebab(name) {
  return name.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function hasWord(text, word) {
  return new RegExp(`\\b${word}\\b`).test(text);
}

function utilTest(util) {
  const cases = util.rows.slice(0, util.tested).map(([expression, expected], i) => `test('${util.name} case ${i + 1}', () => {\n  assert.deepEqual(${expression}, ${expected})\n})\n`);
  const header = `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { ${util.name} } from '../../src/util/${util.file}.mjs'\n`;
  return `${header}\n${cases.join('\n')}`;
}

const ONCE = [
  { subject: 'docs: link the guide from the README', run: (files) => append(files, 'README.md', '\nSee docs/guide.md for the helper reference.\n') },
  { subject: 'chore: add editorconfig', run: (files) => { files['.editorconfig'] = 'root = true\n\n[*]\nindent_style = space\nindent_size = 2\nend_of_line = lf\ninsert_final_newline = true\n'; } },
  { subject: 'docs: add contributing notes', run: (files) => { files['CONTRIBUTING.md'] = '# Contributing\n\nRun `npm test` before sending a change.\nKeep helpers small and covered by a test.\n'; } },
  { subject: 'chore: ignore coverage output', run: (files) => append(files, '.gitignore', 'coverage\n') },
  { subject: 'chore: declare the supported node range', run: (files) => edit(files, 'package.json', '"private": true,', '"private": true,\n  "engines": { "node": ">=20" },') },
  { subject: 'docs: add a license note', run: (files) => append(files, 'README.md', '\n## License\n\nMIT\n') },
];

function bumpVersion(files) {
  const match = files['package.json'].match(/"version": "(\d+)\.(\d+)\.(\d+)"/);
  const next = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
  edit(files, 'package.json', match[0], `"version": "${next}"`);
  return next;
}

function noiseOps(spec, next) {
  const core = spec.core;
  const state = {
    utils: [],
    unused: shuffled(POOL, next),
    once: [...ONCE],
    renames: [...core.renames],
    tweaks: [...core.tweaks],
    changelog: 0,
  };
  const pickUtil = (test) => {
    const found = state.utils.filter(test);
    return found[Math.floor(next() * found.length)];
  };
  const renamable = ([from, to], files) => hasWord(files[core.file], from) && !hasWord(files[core.file], to);

  const addUtil = (files) => {
    const template = state.unused.pop();
    const util = { ...template, file: kebab(template.name), tested: 0, documented: false, moved: false };
    state.utils.push(util);
    files[`src/util/${util.file}.mjs`] = `${util.code}\n`;
    append(files, 'src/util/index.mjs', `export * from './${util.file}.mjs'\n`);
    if (next() < 0.5) {
      util.tested = 1;
      files[`test/util/${util.file}.test.mjs`] = utilTest(util);
    }
    return next() < 0.5 ? `feat(util): add ${util.name}` : `feat: add ${util.name} helper`;
  };

  const testUtil = (files) => {
    const util = pickUtil((u) => u.tested < u.rows.length);
    const fresh = util.tested === 0;
    util.tested += 1;
    files[`test/util/${util.file}.test.mjs`] = utilTest(util);
    return fresh ? `test: cover ${util.name}` : `test: add edge case for ${util.name}`;
  };

  const documentUtil = (files) => {
    const util = pickUtil((u) => !u.documented);
    util.documented = true;
    append(files, 'docs/guide.md', `\n## ${util.name}\n\nExported from \`src/util/index.mjs\`.\n`);
    return `docs: document ${util.name}`;
  };

  const changelog = (files) => {
    state.changelog += 1;
    const latest = state.utils.at(-1);
    const line = latest ? `Added \`${latest.name}\`.` : 'Maintenance release.';
    append(files, 'CHANGELOG.md', `\n## Entry ${state.changelog}\n\n- ${line}\n`);
    return `docs: update changelog for entry ${state.changelog}`;
  };

  const coreHelper = (files) => {
    const template = state.unused.pop();
    append(files, core.file, `\n${template.code}\n`);
    return `feat: add ${template.name} helper to ${core.file.split('/').pop()}`;
  };

  const renameInCore = (files) => {
    const index = state.renames.findIndex((pair) => renamable(pair, files));
    const [from, to] = state.renames.splice(index, 1)[0];
    files[core.file] = files[core.file].replace(new RegExp(`\\b${from}\\b`, 'g'), to);
    return `refactor: rename ${from} to ${to}`;
  };

  const tweakCore = (files) => {
    const tweak = state.tweaks.shift();
    append(files, core.file, `\n${tweak.append}\n`);
    return tweak.subject;
  };

  const bump = (files) => `chore: bump version to ${bumpVersion(files)}`;

  const moveUtil = (files) => {
    const util = pickUtil((u) => !u.moved && u.tested > 0);
    const old = { module: `src/util/${util.file}.mjs`, test: `test/util/${util.file}.test.mjs`, file: util.file };
    util.file = `${old.file}-helpers`;
    util.moved = true;
    files[`src/util/${util.file}.mjs`] = files[old.module];
    files[`test/util/${util.file}.test.mjs`] = files[old.test].replaceAll(`/${old.file}.mjs`, `/${util.file}.mjs`);
    delete files[old.module];
    delete files[old.test];
    files['src/util/index.mjs'] = files['src/util/index.mjs'].replaceAll(`./${old.file}.mjs`, `./${util.file}.mjs`);
    return `refactor: move ${util.name} into ${util.file}`;
  };

  const runOnce = (files) => {
    const item = state.once.shift();
    item.run(files);
    return item.subject;
  };

  return [
    { weight: 24, feasible: () => state.unused.length > 0, run: addUtil },
    { weight: 14, feasible: () => state.utils.some((u) => u.tested < u.rows.length), run: testUtil },
    { weight: 10, feasible: () => state.utils.some((u) => !u.documented), run: documentUtil },
    { weight: 5, feasible: () => true, run: changelog },
    { weight: 8, feasible: () => state.unused.length > 0, run: coreHelper },
    { weight: 7, feasible: (files) => state.renames.some((pair) => renamable(pair, files)), run: renameInCore },
    { weight: 9, feasible: () => state.tweaks.length > 0, run: tweakCore },
    { weight: 6, feasible: () => true, run: bump },
    { weight: 5, feasible: () => state.utils.some((u) => !u.moved && u.tested > 0), run: moveUtil },
    { weight: 4, feasible: () => state.once.length > 0, run: runOnce },
  ];
}

function chooseOp(ops, files, next) {
  const feasible = ops.filter((op) => op.feasible(files));
  const total = feasible.reduce((sum, op) => sum + op.weight, 0);
  let roll = next() * total;
  for (const op of feasible) {
    roll -= op.weight;
    if (roll < 0) return op;
  }
  return feasible.at(-1);
}

function placeSteps(steps, count) {
  const slots = new Map();
  let previous = 0;
  for (const step of steps) {
    const index = Math.max(Math.round(step.at * (count - 1)), previous + 1);
    slots.set(index, step);
    previous = index;
  }
  if (previous > count - 6) throw new Error('step too close to the end of history');
  return slots;
}

function baseFiles(spec) {
  const pkg = { name: spec.name, version: '0.1.0', private: true, type: 'module', scripts: { test: 'node --test' } };
  return {
    'package.json': `${JSON.stringify(pkg, null, 2)}\n`,
    '.gitignore': 'node_modules\n',
    'docs/guide.md': `# ${spec.name} guide\n`,
    'src/util/index.mjs': '',
    ...spec.base,
  };
}

function diff(previous, current) {
  const ops = [];
  for (const path of Object.keys(previous)) if (!(path in current)) ops.push({ path, remove: true });
  for (const [path, text] of Object.entries(current)) if (previous[path] !== text) ops.push({ path, text });
  return ops;
}

function fastImportStream(commits) {
  const chunks = [];
  const put = (text) => chunks.push(Buffer.from(text));
  commits.forEach((commit, i) => {
    const message = Buffer.from(commit.body ? `${commit.subject}\n\n${commit.body}\n` : `${commit.subject}\n`);
    put(`commit refs/heads/main\nmark :${i + 1}\nauthor ${IDENT} ${commit.time} +0000\ncommitter ${IDENT} ${commit.time} +0000\ndata ${message.length}\n`);
    chunks.push(message);
    put('\n');
    for (const op of commit.ops) {
      if (op.remove) {
        put(`D ${op.path}\n`);
        continue;
      }
      const data = Buffer.from(op.text);
      put(`M 100644 inline ${op.path}\ndata ${data.length}\n`);
      chunks.push(data);
      put('\n');
    }
    put('\n');
  });
  return Buffer.concat(chunks);
}

function git(dest, args, input) {
  const result = spawnSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd: dest, env: GIT_ENV, input });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
}

function planCommits(spec) {
  const next = random(spec.seed);
  const ops = noiseOps(spec, next);
  const slots = placeSteps(spec.steps, spec.count);
  const files = baseFiles(spec);
  const commits = [{ subject: spec.rootSubject ?? 'chore: initial commit', ops: diff({}, files), time: START_SECONDS }];
  let time = START_SECONDS;
  let culpritIndex = null;
  for (let index = 1; index < spec.count; index++) {
    const before = { ...files };
    const step = slots.get(index);
    const subject = step ? step.subject : chooseOp(ops, files, next).run(files);
    if (step) step.apply(files);
    if (step?.culprit) culpritIndex = index;
    time += MIN_STEP_SECONDS + Math.floor(next() * (MAX_STEP_SECONDS - MIN_STEP_SECONDS));
    commits.push({ subject, body: step?.body, ops: diff(before, files), time });
  }
  return { commits, culpritIndex };
}

function checkCulprit(commits, culpritIndex) {
  if (culpritIndex === null) return;
  const count = commits.length;
  const ratio = culpritIndex / (count - 1);
  if (ratio < 0.3 || ratio > 0.85 || culpritIndex > count - 6) throw new Error(`culprit at ${culpritIndex} of ${count} is out of range`);
  const subject = commits[culpritIndex].subject;
  if (commits.filter((commit) => commit.subject === subject).length !== 1) throw new Error(`culprit subject is not unique: ${subject}`);
}

export function buildHistory(dest, spec) {
  const { commits, culpritIndex } = planCommits(spec);
  checkCulprit(commits, culpritIndex);
  mkdirSync(dest, { recursive: true });
  git(dest, ['init', '-q', '-b', 'main']);
  git(dest, ['fast-import', '--quiet'], fastImportStream(commits));
  git(dest, ['reset', '-q', '--hard', 'main']);
  git(dest, ['config', 'user.name', 'Dana Keller']);
  git(dest, ['config', 'user.email', 'dana@example.test']);
  return { count: commits.length, culpritIndex };
}
