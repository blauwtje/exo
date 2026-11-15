import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tempDir } from './harness.mjs';

const SCRIPTS = fileURLToPath(new URL('../skills/spec/scripts/', import.meta.url));
const PRELOAD = fileURLToPath(new URL('./fixtures/research/cli-preload.mjs', import.meta.url));
const TIMEOUT_MS = 50000;

function readCalls(log) {
  if (!fs.existsSync(log)) return [];
  return fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

export function runResearchScript(name, args, { routes = [], renders = [], env = {}, input } = {}) {
  const home = tempDir('research-cli-');
  const log = path.join(home, 'calls.jsonl');
  const stubFile = path.join(home, 'stub.json');
  fs.writeFileSync(stubFile, JSON.stringify({ routes, renders, log }));
  const childEnv = { ...process.env, CLAUDE_PLUGIN_DATA: path.join(home, 'data'), EXO_WATCH_GATE_MS: '0', EXO_FETCH_STUB: stubFile, ...env };
  const result = spawnSync(process.execPath, ['--import', PRELOAD, path.join(SCRIPTS, name), ...args], { cwd: home, input, encoding: 'utf8', timeout: TIMEOUT_MS, env: childEnv });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls: readCalls(log) };
}

export function fetchUrls(runDir, urls, options) {
  return runResearchScript('fetch.mjs', [runDir, ...urls], options);
}

export function savePage(runDir, url, text) {
  return runResearchScript('fetch.mjs', ['--save', runDir, url], { input: text });
}
