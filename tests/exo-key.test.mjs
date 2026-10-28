import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const CLI = fileURLToPath(new URL('../skills/build/scripts/exo-cli.mjs', import.meta.url));
const SECRET = 'sk-secret-value-123';

async function keySet(provider, input, files = {}) {
  const home = await fixture();
  const directory = path.join(home, '.config', 'exo');
  await fs.mkdir(directory, { recursive: true });
  for (const [name, text] of Object.entries(files)) await fs.writeFile(path.join(directory, name), text);
  const result = await run(CLI, ['key', 'set', provider], { env: { HOME: home }, input });
  const file = path.join(directory, 'keys.env');
  return { result, file, directory, text: await fs.readFile(file, 'utf8').catch(() => null) };
}

const modeOf = async (target) => (await fs.stat(target)).mode & 0o777;

test('a piped key lands in a new keys.env with mode 0600 in a 0700 directory and is never printed', async () => {
  const { result, file, directory, text } = await keySet('deepseek', `${SECRET}\n`);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(text, `DEEPSEEK_API_KEY=${SECRET}\n`);
  assert.equal(await modeOf(file), 0o600);
  assert.equal(await modeOf(directory), 0o700);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET));
  assert.deepEqual((await fs.readdir(directory)).sort(), ['keys.env']);
});

test('a key replaces its own line and keeps comments and other lines as they were', async () => {
  const before = '# my keys\nZAI_API_KEY=zai-old\n\nDEEPSEEK_API_KEY=old\r\nOTHER=1\n';
  const { result, text } = await keySet('deepseek', `${SECRET}\r\n`, { 'keys.env': before });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(text, `# my keys\nZAI_API_KEY=zai-old\n\nDEEPSEEK_API_KEY=${SECRET}\nOTHER=1\n`);
});

test('a key for a name not yet in the file is appended after a file without a final newline', async () => {
  const { result, text } = await keySet('zai', `${SECRET}\n`, { 'keys.env': 'DEEPSEEK_API_KEY=d' });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(text, `DEEPSEEK_API_KEY=d\nZAI_API_KEY=${SECRET}\n`);
});

test('a commented line for the same name is left alone and the key is appended', async () => {
  const { text } = await keySet('zai', `${SECRET}\n`, { 'keys.env': '# ZAI_API_KEY=old\n' });
  assert.equal(text, `# ZAI_API_KEY=old\nZAI_API_KEY=${SECRET}\n`);
});

test('an unknown provider and a provider without a key are refused and write nothing', async () => {
  for (const provider of ['nope', 'claude', '__proto__']) {
    const { result, text } = await keySet(provider, `${SECRET}\n`);
    assert.equal(result.code, 2, provider);
    assert.match(result.stderr, /not a provider with a key/, provider);
    assert.equal(text, null, provider);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(SECRET), provider);
  }
});

test('an empty value, a value with whitespace and a value with a newline are refused and keep the file', async () => {
  const before = 'DEEPSEEK_API_KEY=old\n';
  for (const input of ['', '\n', 'abc def\n', 'abc \n', ' abc\n', 'abc\tdef\n', `${SECRET}\nsecond\n`, `${SECRET}\r\r\n`]) {
    const { result, text } = await keySet('deepseek', input, { 'keys.env': before });
    assert.equal(result.code, 2, JSON.stringify(input));
    assert.equal(text, before, JSON.stringify(input));
    assert.doesNotMatch(result.stdout + result.stderr, /sk-secret|abc/, JSON.stringify(input));
  }
});

test('key without set and a missing provider print usage', async () => {
  const home = await fixture();
  for (const args of [['key'], ['key', 'get', 'deepseek'], ['key', 'set'], ['key', 'set', 'a', 'b']]) {
    const result = await run(CLI, args, { env: { HOME: home }, input: '' });
    assert.equal(result.code, 2, args.join(' '));
    assert.match(result.stderr, /usage: exo key set <provider>/, args.join(' '));
  }
});

test('a provider added in the user run.json can take a key', async () => {
  const userConfig = JSON.stringify({ providers: { mine: { model: 'm', efforts: ['low'], key: 'MINE_KEY', env: {} } } });
  const { result, text } = await keySet('mine', `${SECRET}\n`, { 'run.json': userConfig });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(text, `MINE_KEY=${SECRET}\n`);
});
