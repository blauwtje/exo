import fs from 'node:fs';
import childProcess from 'node:child_process';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';

const world = JSON.parse(process.env.FAKE_WORLD ?? '{}');
const PORT = 9222;
const events = [];

function record(event) {
  events.push({ at: Date.now(), ...event });
  fs.writeFileSync(world.log, JSON.stringify(events));
}

function answerFor(list, url) {
  const route = (list ?? []).find((candidate) => url.includes(candidate.match));
  if (!route) return null;
  return { status: route.status ?? 200, body: route.file ? fs.readFileSync(route.file, 'utf8') : route.body ?? '' };
}

function browserAnswer(url) {
  const json = url.endsWith('/json/list') ? [{ type: 'page', url: 'https://www.reddit.com/', webSocketDebuggerUrl: 'ws://tab' }] : {};
  return new Response(JSON.stringify(json), { status: 200 });
}

globalThis.fetch = async (url) => {
  if (String(url).startsWith(`http://127.0.0.1:${PORT}`)) return browserAnswer(String(url));
  record({ kind: 'fetch', url: String(url) });
  const found = answerFor(world.routes, String(url));
  if (!found) throw new TypeError(`unexpected fetch ${url}`);
  return new Response(found.body, { status: found.status });
};

globalThis.WebSocket = class {
  constructor() {
    this.listeners = {};
    queueMicrotask(() => this.listeners.open?.({}));
  }

  addEventListener(name, handler) {
    this.listeners[name] = handler;
  }

  send(message) {
    const { params } = JSON.parse(message);
    const url = JSON.parse(params.expression.match(/^fetch\((".*?"), /)[1]);
    record({ kind: 'evaluate', url, expression: params.expression, awaitPromise: params.awaitPromise });
    const page = answerFor(world.pages, url) ?? { status: 404, body: '' };
    const value = { status: page.status, text: page.body };
    queueMicrotask(() => this.listeners.message({ data: JSON.stringify({ id: 1, result: { result: { value } } }) }));
  }

  close() {
    record({ kind: 'closed' });
  }
};

const realExists = fs.existsSync;
fs.existsSync = (file) => {
  const candidate = String(file);
  if (!/Brave|Chrome|brave|chrome/.test(candidate)) return realExists(file);
  return (world.installed ?? []).some((name) => candidate.includes(name));
};

const realSpawn = childProcess.spawn;
childProcess.spawn = (command, args, options) => {
  if (!args?.some((arg) => String(arg).startsWith('--user-data-dir='))) return realSpawn(command, args, options);
  record({ kind: 'spawn', command, args });
  const profile = args.find((arg) => String(arg).startsWith('--user-data-dir=')).slice('--user-data-dir='.length);
  fs.mkdirSync(profile, { recursive: true });
  if (world.starts !== false) fs.writeFileSync(path.join(profile, 'DevToolsActivePort'), `${PORT}\n/devtools/browser/x`);
  return { unref() {} };
};

if (world.platform) Object.defineProperty(process, 'platform', { value: world.platform });
syncBuiltinESMExports();
