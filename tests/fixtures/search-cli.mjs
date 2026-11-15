import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { tempDir } from '../harness.mjs';

const SCRIPT = new URL('../../skills/spec/scripts/search.mjs', import.meta.url).pathname;
const PRELOAD = new URL('./fake-world.mjs', import.meta.url).href;

export const fixturePath = (name) => new URL(`../fixtures/${name}`, import.meta.url).pathname;

function startedBrowser(home) {
  const profile = path.join(home, 'exo', 'reddit-browser');
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'DevToolsActivePort'), '9222\n/devtools/browser/x');
}

export function runSearch(args, world = {}, env = {}) {
  const home = tempDir('search-home-');
  const log = path.join(home, 'world.json');
  const fakeWorld = JSON.stringify({ ...world, log });
  if (world.running) startedBrowser(home);
  const options = {
    cwd: home,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, XDG_CACHE_HOME: home, CLAUDE_PLUGIN_DATA: home, EXO_WATCH_GATE_MS: '0', FAKE_WORLD: fakeWorld, ...env },
  };
  const run = spawnSync(process.execPath, ['--import', PRELOAD, SCRIPT, ...args], options);
  const events = fs.existsSync(log) ? JSON.parse(fs.readFileSync(log, 'utf8')) : [];
  return { ...run, events, home, lines: run.stdout.split('\n').filter(Boolean) };
}
