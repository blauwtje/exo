import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn as spawnProcess } from 'node:child_process';
import { environmentMs } from '../../../../lib/script-flags.mjs';
import { BlockedRoute } from './http.mjs';

const HOME_URL = 'https://www.reddit.com/';
const LOGIN_URL = 'https://www.reddit.com/login/';
const START_MS = 15000;
const POLL_MS = 200;

const BROWSERS = {
  darwin: ['/Applications/Brave Browser.app', '/Applications/Google Chrome.app'],
  linux: ['/usr/bin/brave-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'],
};

const defaults = () => ({
  spawn: spawnProcess,
  fetchImpl: fetch,
  WebSocketImpl: WebSocket,
  env: process.env,
  platform: process.platform,
  exists: fs.existsSync,
  readFile: (file) => fs.readFileSync(file, 'utf8'),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

export function profileDirectory(env = process.env) {
  const cache = env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
  return path.join(cache, 'exo', 'reddit-browser');
}

export function findBrowser({ platform, exists }) {
  const found = (BROWSERS[platform] ?? []).find((candidate) => exists(candidate));
  if (!found) throw new BlockedRoute('reddit blocked: no Brave or Google Chrome found; install one, then run search.mjs --source reddit --login');
  return found;
}

function readPort({ env, readFile }) {
  try {
    return Number(readFile(path.join(profileDirectory(env), 'DevToolsActivePort')).split('\n')[0]);
  } catch {
    return 0;
  }
}

async function answers(port, { fetchImpl }) {
  if (!port) return false;
  try {
    const response = await fetchImpl(`http://127.0.0.1:${port}/json/version`);
    return response.ok;
  } catch {
    return false;
  }
}

function startBrowser(url, context, visible = false) {
  const { spawn, platform, env, exists } = context;
  const binary = findBrowser({ platform, exists });
  const flags = [`--user-data-dir=${profileDirectory(env)}`, '--remote-debugging-port=0', '--no-first-run', url];
  const [command, args] = platform === 'darwin' ? ['open', [...(visible ? [] : ['-g', '-j']), '-na', binary, '--args', ...flags]] : [binary, flags];
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}

async function waitForPort(context) {
  const deadline = Date.now() + environmentMs('EXO_REDDIT_BROWSER_MS', START_MS, context.env);
  while (Date.now() < deadline) {
    const port = readPort(context);
    if (await answers(port, context)) return port;
    await context.sleep(POLL_MS);
  }
  throw new BlockedRoute('reddit blocked: the exo browser did not start in time; raise EXO_REDDIT_BROWSER_MS or run search.mjs --source reddit --login');
}

async function pageTarget(port, url, { fetchImpl }) {
  const list = await (await fetchImpl(`http://127.0.0.1:${port}/json/list`)).json();
  const existing = list.find((target) => target.type === 'page' && target.url.startsWith(url));
  if (existing) return existing;
  const created = await fetchImpl(`http://127.0.0.1:${port}/json/new?${url}`, { method: 'PUT' });
  return created.json();
}

function connect(socketUrl, WebSocketImpl) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocketImpl(socketUrl);
    socket.addEventListener('open', () => resolve(socket));
    socket.addEventListener('error', () => reject(new BlockedRoute('reddit blocked: the exo browser tab refused the debugging connection')));
  });
}

function evaluate(socket, expression) {
  return new Promise((resolve, reject) => {
    socket.addEventListener('message', (event) => {
      const reply = JSON.parse(event.data);
      if (reply.id !== 1) return;
      if (reply.error || reply.result?.exceptionDetails) return reject(new BlockedRoute('reddit blocked: the in-page fetch failed'));
      resolve(reply.result.result.value);
    });
    socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
}

export async function openBrowser(overrides = {}, url = HOME_URL) {
  const context = { ...defaults(), ...overrides };
  if (!(await answers(readPort(context), context))) startBrowser(url, context);
  const port = await waitForPort(context);
  const target = await pageTarget(port, url, context);
  const socket = await connect(target.webSocketDebuggerUrl, context.WebSocketImpl);
  return { evaluate: (expression) => evaluate(socket, expression), close: () => socket.close() };
}

export async function pageFetch(url, overrides = {}) {
  const browser = await openBrowser(overrides);
  const expression = `fetch(${JSON.stringify(url)}, { credentials: 'include' }).then(async (response) => ({ status: response.status, text: await response.text() }))`;
  try {
    const { status, text } = await browser.evaluate(expression);
    if (status === 403) throw new BlockedRoute('reddit blocked: 403 inside the exo browser; run search.mjs --source reddit --login');
    return { status, text };
  } finally {
    browser.close();
  }
}

export async function loginBrowser(overrides = {}) {
  const context = { ...defaults(), ...overrides };
  if (await answers(readPort(context), context)) {
    const target = await pageTarget(readPort(context), LOGIN_URL, context);
    await context.fetchImpl(`http://127.0.0.1:${readPort(context)}/json/activate/${target.id}`);
    return;
  }
  startBrowser(LOGIN_URL, context, true);
  await waitForPort(context);
}
