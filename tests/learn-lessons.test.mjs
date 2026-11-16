import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../skills/learn/scripts/lessons.mjs', import.meta.url));

const GOOD_NOTE = [
  '---',
  'name: Run tests first',
  'description: before any commit, so a failure shows early',
  'type: feedback',
  'seen: 2026-11-01, 2026-11-10',
  '---',
  'Run the tests first.',
  'Why: a skipped run hid a failure.',
  'How to apply: before every commit.',
  ''
].join('\n');

function store(notes) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-lessons-'));
  const dir = path.join(root, '.claude', 'lessons');
  const rules = path.join(root, '.claude', 'rules');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(rules);
  for (const [name, text] of Object.entries(notes)) {
    if (name === 'index.md') fs.writeFileSync(path.join(rules, 'lessons.md'), text);
    else fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

function indexOf(names) {
  return names.map((name) => `- [${name}](.claude/lessons/${name}.md) — when it applies\n`).join('');
}

function check(dir) {
  return spawnSync(process.execPath, [script, 'check', '--dir', dir], { encoding: 'utf8' });
}

test('a clean store prints its count and exits 0', () => {
  const dir = store({ 'a.md': GOOD_NOTE, 'b.md': GOOD_NOTE, 'index.md': indexOf(['a', 'b']) });
  const result = check(dir);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), 'lessons: 2 of 15');
});

test('a missing default directory passes and a missing explicit one fails', () => {
  const missing = path.join(os.tmpdir(), 'learn-lessons-missing-dir');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-lessons-cwd-'));
  assert.equal(spawnSync(process.execPath, [script, 'check'], { cwd, encoding: 'utf8' }).status, 0);
  const result = check(missing);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no such directory/);
});

test('16 notes fail', () => {
  const names = Array.from({ length: 16 }, (_, index) => `n${index}`);
  const notes = Object.fromEntries(names.map((name) => [`${name}.md`, GOOD_NOTE]));
  const result = check(store({ ...notes, 'index.md': indexOf(names) }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /16 notes/);
});

test('a note without Why fails', () => {
  const result = check(store({ 'a.md': GOOD_NOTE.replace(/Why:.*\n/, ''), 'index.md': indexOf(['a']) }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /a\.md.*Why:/);
});

test('a seen line without a date fails', () => {
  const result = check(store({ 'a.md': GOOD_NOTE.replace(/seen:.*\n/, 'seen: last week\n'), 'index.md': indexOf(['a']) }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /a\.md.*date/);
});

test('a note without frontmatter fails', () => {
  const result = check(store({ 'a.md': 'Run the tests.\nWhy: x\nHow to apply: y\n', 'index.md': indexOf(['a']) }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /a\.md.*frontmatter/);
});

test('a note with a wrong type fails', () => {
  const result = check(store({ 'a.md': GOOD_NOTE.replace('feedback', 'user'), 'index.md': indexOf(['a']) }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /a\.md.*type/);
});

test('a note without a rule line fails', () => {
  const result = check(store({ 'a.md': GOOD_NOTE.replace('Run the tests first.\n', ''), 'index.md': indexOf(['a']) }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /a\.md.*rule/);
});

test('a note over 12 lines fails', () => {
  const result = check(store({ 'a.md': `${GOOD_NOTE}1\n2\n3\n4\n5\n6\n`, 'index.md': indexOf(['a']) }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /a\.md.*lines/);
});

test('an index link to a missing note fails', () => {
  const result = check(store({ 'a.md': GOOD_NOTE, 'index.md': indexOf(['a', 'ghost']) }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /lessons\.md.*ghost\.md/);
});

test('an index that misses a note fails', () => {
  const result = check(store({ 'a.md': GOOD_NOTE, 'b.md': GOOD_NOTE, 'index.md': indexOf(['a']) }));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /lessons\.md.*b\.md/);
});

test('paths prints the five places and check reads the index from the rules folder', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-lessons-paths-'));
  const config = path.join(base, 'config');
  const shared = path.join(base, 'shared');
  const project = path.join(base, 'project');
  fs.mkdirSync(config);
  fs.mkdirSync(path.join(shared, 'rules'), { recursive: true });
  fs.mkdirSync(project);
  fs.symlinkSync(path.join(shared, 'rules'), path.join(config, 'rules'));
  const env = { ...process.env, CLAUDE_CONFIG_DIR: config };
  const result = spawnSync(process.execPath, [script, 'paths', '--cwd', project], { encoding: 'utf8', env });
  assert.equal(result.status, 0);
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines.length, 5);
  assert.deepEqual(lines.slice(0, 4), [
    `project store: ${path.join(project, '.claude', 'lessons')}`,
    `project index: ${path.join(project, '.claude', 'rules', 'lessons.md')}`,
    `personal store: ${path.join(fs.realpathSync(shared), 'lessons')}`,
    `personal index: ${path.join(config, 'rules', 'lessons.md')}`
  ]);
  assert.match(lines[4], /^auto memory: .*[\\/]projects[\\/].*[\\/]memory[\\/]MEMORY\.md$/);

  const personalStore = path.join(fs.realpathSync(shared), 'lessons');
  fs.mkdirSync(personalStore);
  fs.writeFileSync(path.join(personalStore, 'a.md'), GOOD_NOTE);
  const link = `- [a](${path.join(personalStore, 'a.md')}) — when it applies\n`;
  const old = spawnSync(process.execPath, [script, 'check', '--dir', personalStore], { encoding: 'utf8' });
  assert.equal(old.status, 1);
  fs.writeFileSync(path.join(config, 'rules', 'lessons.md'), link);
  assert.equal(spawnSync(process.execPath, [script, 'check', '--dir', personalStore], { encoding: 'utf8' }).status, 0);
});

test('a path note counts and needs its own link', () => {
  const dir = store({ 'index.md': '' });
  const notes = path.join(dir, '..', 'rules', 'lessons');
  fs.mkdirSync(notes);
  fs.writeFileSync(path.join(notes, 'p.md'), GOOD_NOTE.replace('type: feedback', 'type: feedback\npaths:\n  - src/**'));
  const missing = check(dir);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /lessons\.md.*p\.md/);
  fs.writeFileSync(path.join(dir, '..', 'rules', 'lessons.md'), '- [p](.claude/rules/lessons/p.md) — when it applies\n');
  assert.equal(check(dir).stdout.trim(), 'lessons: 1 of 15');
});

test('migrate moves an old index to the rules folder and a second run changes nothing', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-lessons-migrate-'));
  const config = path.join(base, 'config');
  const project = path.join(base, 'project');
  fs.mkdirSync(path.join(config, 'lessons'), { recursive: true });
  fs.mkdirSync(project);
  const line = '- Lessons, open a note when its description fits the task: @lessons/index.md';
  const imported = path.join(config, 'global.md');
  const entry = path.join(config, 'CLAUDE.md');
  fs.writeFileSync(entry, '@global.md\n');
  fs.writeFileSync(imported, `- keep this\n${line}\n- and this\n`);
  fs.writeFileSync(path.join(config, 'lessons', 'index.md'), '- [a](a.md) — when it applies\n');
  const env = { ...process.env, CLAUDE_CONFIG_DIR: config };
  const migrate = () => spawnSync(process.execPath, [script, 'migrate', '--cwd', project], { encoding: 'utf8', env });

  const first = migrate();
  assert.equal(first.status, 0);
  assert.equal(first.stdout, `removed: ${imported}: ${line}\n`);
  assert.equal(fs.readFileSync(imported, 'utf8'), '- keep this\n- and this\n');
  assert.equal(fs.existsSync(path.join(config, 'lessons', 'index.md')), false);
  const index = path.join(config, 'rules', 'lessons.md');
  assert.equal(fs.readFileSync(index, 'utf8'), `- [a](${path.join(config, 'lessons', 'a.md')}) — when it applies\n`);

  const before = [entry, imported, index].map((file) => fs.readFileSync(file, 'utf8'));
  const second = migrate();
  assert.equal(second.status, 0);
  assert.equal(second.stdout, '');
  assert.deepEqual([entry, imported, index].map((file) => fs.readFileSync(file, 'utf8')), before);
});

function migrateFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'learn-lessons-fix-'));
  const config = path.join(base, 'config');
  const project = path.join(base, 'project');
  const home = path.join(base, 'home');
  for (const dir of [config, project, home]) fs.mkdirSync(dir, { recursive: true });
  const env = { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: config };
  const migrate = (cwd = project) => spawnSync(process.execPath, [script, 'migrate', '--cwd', cwd], { encoding: 'utf8', env });
  return { base, config, project, home, env, migrate };
}

const OLD_LINE = 'Lessons, open a note when its description fits the task:';

test('check passes a missing store folder when the rules folder holds a valid path note', () => {
  const dir = store({ 'index.md': '- [p](.claude/rules/lessons/p.md) — when it applies\n' });
  const notes = path.join(dir, '..', 'rules', 'lessons');
  fs.mkdirSync(notes);
  fs.writeFileSync(path.join(notes, 'p.md'), GOOD_NOTE.replace('type: feedback', 'type: feedback\npaths:\n  - src/**'));
  fs.rmSync(dir, { recursive: true });
  const result = check(dir);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'lessons: 1 of 15');
});

test('a paths key with no items fails even when another key holds a list', () => {
  const dir = store({ 'index.md': '' });
  const notes = path.join(dir, '..', 'rules', 'lessons');
  fs.mkdirSync(notes);
  fs.writeFileSync(path.join(notes, 'p.md'), GOOD_NOTE.replace('type: feedback', 'type: feedback\npaths:\ntags:\n  - x'));
  fs.writeFileSync(path.join(dir, '..', 'rules', 'lessons.md'), '- [p](.claude/rules/lessons/p.md) — when it applies\n');
  const result = check(dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /no paths list/);
});

test('migrate moves the notes of an old index outside the store and leaves other links alone', () => {
  const { home, config, project, migrate } = migrateFixture();
  const old = path.join(home, 'old');
  fs.mkdirSync(old);
  fs.writeFileSync(path.join(config, 'CLAUDE.md'), `- ${OLD_LINE} @${path.join(old, 'index.md')}\n`);
  fs.writeFileSync(path.join(old, 'index.md'), '- [a](a.md) — when\n- [docs](https://example.com/x) — external\n');
  fs.writeFileSync(path.join(old, 'a.md'), GOOD_NOTE);
  assert.equal(migrate().status, 0);
  assert.equal(fs.readFileSync(path.join(config, 'lessons', 'a.md'), 'utf8'), GOOD_NOTE);
  assert.equal(fs.existsSync(path.join(old, 'a.md')), false);
  assert.equal(fs.readFileSync(path.join(config, 'rules', 'lessons.md'), 'utf8'), `- [a](${path.join(config, 'lessons', 'a.md')}) — when\n- [docs](https://example.com/x) — external\n`);
});

test('migrate keeps the index when the old import path is the new index', () => {
  const { project, migrate } = migrateFixture();
  const index = path.join(project, '.claude', 'rules', 'lessons.md');
  fs.mkdirSync(path.dirname(index), { recursive: true });
  fs.writeFileSync(index, '- [a](.claude/lessons/a.md) — when\n');
  fs.writeFileSync(path.join(project, 'CLAUDE.md'), `${OLD_LINE} @.claude/rules/lessons.md\n`);
  assert.equal(migrate().status, 0);
  assert.equal(fs.readFileSync(index, 'utf8'), '- [a](.claude/lessons/a.md) — when\n');
  assert.equal(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf8'), '');
});

test('a file in the project and personal lists is migrated once, with absolute links', () => {
  const { base, config, migrate } = migrateFixture();
  fs.symlinkSync(config, path.join(base, '.claude'));
  fs.mkdirSync(path.join(config, 'lessons'));
  fs.writeFileSync(path.join(config, 'CLAUDE.md'), `- ${OLD_LINE} @lessons/index.md\n`);
  fs.writeFileSync(path.join(config, 'lessons', 'index.md'), '- [a](a.md) — when\n');
  fs.writeFileSync(path.join(config, 'lessons', 'a.md'), GOOD_NOTE);
  const result = migrate(base);
  assert.equal(result.status, 0);
  assert.equal(fs.readFileSync(path.join(config, 'rules', 'lessons.md'), 'utf8'), `- [a](${path.join(config, 'lessons', 'a.md')}) — when\n`);
});

function autoMemoryFixture() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'learn-lessons-auto-')));
  const config = path.join(base, 'config');
  const repo = path.join(base, 'repo');
  const sub = path.join(repo, 'packages', 'app');
  fs.mkdirSync(config);
  fs.mkdirSync(sub, { recursive: true });
  assert.equal(spawnSync('git', ['init', '-q'], { cwd: repo }).status, 0);
  const env = { ...process.env, CLAUDE_CONFIG_DIR: config };
  delete env.CLAUDE_CODE_DISABLE_AUTO_MEMORY;
  delete env.CLAUDE_CODE_PROJECT_DIR_NAME;
  const autoMemory = (cwd) => {
    const result = spawnSync(process.execPath, [script, 'paths', '--cwd', cwd], { encoding: 'utf8', env });
    assert.equal(result.status, 0);
    const lines = result.stdout.trim().split('\n');
    assert.equal(lines.length, 5);
    return lines[4];
  };
  const writeSettings = (dir, name, settings) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), typeof settings === 'string' ? settings : JSON.stringify(settings));
  };
  return { base, config, repo, sub, env, autoMemory, writeSettings };
}

test('auto memory from a subfolder sits under the repo root project folder', () => {
  const { config, repo, sub, autoMemory } = autoMemoryFixture();
  const folder = repo.replace(/[^A-Za-z0-9]/g, '-');
  assert.equal(autoMemory(sub), `auto memory: ${path.join(config, 'projects', folder, 'memory', 'MEMORY.md')}`);
});

test('CLAUDE_CODE_PROJECT_DIR_NAME replaces the project folder name', () => {
  const { config, sub, env } = autoMemoryFixture();
  const result = spawnSync(process.execPath, [script, 'paths', '--cwd', sub], { encoding: 'utf8', env: { ...env, CLAUDE_CODE_PROJECT_DIR_NAME: 'named' } });
  assert.equal(result.stdout.trim().split('\n')[4], `auto memory: ${path.join(config, 'projects', 'named', 'memory', 'MEMORY.md')}`);
});

test('autoMemoryDirectory in the settings files wins in order local, project, config, with ~/ expanded', () => {
  const { config, repo, sub, autoMemory, writeSettings } = autoMemoryFixture();
  writeSettings(config, 'settings.json', { autoMemoryDirectory: '/from/config' });
  assert.equal(autoMemory(sub), `auto memory: ${path.join('/from/config', 'MEMORY.md')}`);
  writeSettings(path.join(repo, '.claude'), 'settings.json', { autoMemoryDirectory: '~/from-project' });
  assert.equal(autoMemory(repo), `auto memory: ${path.join(os.homedir(), 'from-project', 'MEMORY.md')}`);
  writeSettings(path.join(repo, '.claude'), 'settings.local.json', { autoMemoryDirectory: 'relative/dir' });
  assert.equal(autoMemory(repo), `auto memory: ${path.join('relative/dir', 'MEMORY.md')}`);
});

test('settings that fail to parse count as absent', () => {
  const { repo, autoMemory, writeSettings } = autoMemoryFixture();
  writeSettings(path.join(repo, '.claude'), 'settings.local.json', '{ not json');
  writeSettings(path.join(repo, '.claude'), 'settings.json', { autoMemoryDirectory: '/from/project' });
  assert.equal(autoMemory(repo), `auto memory: ${path.join('/from/project', 'MEMORY.md')}`);
});

test('autoMemoryEnabled false prints none, the first file that sets it deciding', () => {
  const { config, repo, autoMemory, writeSettings } = autoMemoryFixture();
  writeSettings(path.join(repo, '.claude'), 'settings.json', { autoMemoryEnabled: false });
  assert.equal(autoMemory(repo), 'auto memory: none');
  writeSettings(path.join(repo, '.claude'), 'settings.local.json', { autoMemoryEnabled: true });
  assert.match(autoMemory(repo), /memory[\\/]MEMORY\.md$/);
  writeSettings(path.join(repo, '.claude'), 'settings.local.json', {});
  writeSettings(path.join(repo, '.claude'), 'settings.json', {});
  writeSettings(config, 'settings.json', { autoMemoryEnabled: false });
  assert.equal(autoMemory(repo), 'auto memory: none');
});

test('CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 prints none', () => {
  const { repo, env } = autoMemoryFixture();
  const result = spawnSync(process.execPath, [script, 'paths', '--cwd', repo], { encoding: 'utf8', env: { ...env, CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1' } });
  assert.equal(result.stdout.trim().split('\n')[4], 'auto memory: none');
});

test('project store and index sit under the repo top folder when run from a subfolder', () => {
  const { repo, sub, env } = autoMemoryFixture();
  const result = spawnSync(process.execPath, [script, 'paths', '--cwd', sub], { encoding: 'utf8', env });
  const lines = result.stdout.trim().split('\n');
  assert.equal(lines[0], `project store: ${path.join(repo, '.claude', 'lessons')}`);
  assert.equal(lines[1], `project index: ${path.join(repo, '.claude', 'rules', 'lessons.md')}`);
});

function envWithout(name) {
  const env = { ...process.env };
  delete env[name];
  return env;
}

test('CLAUDE_PROJECT_DIR sets the project root before the shell folder', () => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'learn-lessons-envroot-')));
  const sub = path.join(base, 'proj', 'sub');
  fs.mkdirSync(sub, { recursive: true });
  const env = { ...process.env, CLAUDE_PROJECT_DIR: path.join(base, 'proj') };
  const result = spawnSync(process.execPath, [script, 'paths'], { cwd: sub, encoding: 'utf8', env });
  assert.equal(result.stdout.split('\n')[0], `project store: ${path.join(base, 'proj', '.claude', 'lessons')}`);
});

test('check without --dir reads the store at the repo top folder from a subfolder', () => {
  const { repo, sub } = autoMemoryFixture();
  const lessons = path.join(repo, '.claude', 'lessons');
  fs.mkdirSync(lessons, { recursive: true });
  fs.writeFileSync(path.join(lessons, 'broken.md'), 'no frontmatter\n');
  const result = spawnSync(process.execPath, [script, 'check'], { cwd: sub, encoding: 'utf8', env: envWithout('CLAUDE_PROJECT_DIR') });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /broken\.md: no frontmatter/);
});

test('migrate from a subfolder also scans that folder CLAUDE.md', () => {
  const { sub } = autoMemoryFixture();
  const file = path.join(sub, 'CLAUDE.md');
  fs.writeFileSync(file, `- ${OLD_LINE} @.claude/lessons/INDEX.md\n- keep\n`);
  const result = spawnSync(process.execPath, [script, 'migrate'], { cwd: sub, encoding: 'utf8', env: envWithout('CLAUDE_PROJECT_DIR') });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(file, 'utf8'), '- keep\n');
});
