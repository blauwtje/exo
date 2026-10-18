// why: a mod cannot import, so this copy stays; keep it equal to FINAL_PHASES in run-state.mjs.
export const FINAL_PHASES = ['passed', 'landed', 'parked', 'stopped', 'refused', 'crashed'];
const TICK_MS = 5000;
const STALE_MS = 3600000;
const WORKTREES_MARK = '/.git/worktrees/';
const REPORT_PHASES = ['landed', 'passed'];
const RUN_START = /run start:/;
const LIVE_AGENT = ['pending', 'running', 'waiting'];

function parseState(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readState($, file) {
  try {
    return parseState(await $.fs.read(file));
  } catch {
    return null;
  }
}

async function readRuns($, base) {
  let entries;
  try {
    entries = await $.fs.list(base);
  } catch {
    return [];
  }
  const dirs = entries.filter((entry) => entry.kind === 'dir');
  const runs = await Promise.all(dirs.map(async (dir) => ({ id: dir.name, dir: `${base}/${dir.name}`, state: await readState($, `${base}/${dir.name}/state.json`) })));
  return runs.filter((run) => run.state);
}

// why: a mod cannot import node:path; a gitdir may be relative to the worktree (worktree.useRelativePaths) or use backslashes.
function resolveFrom(base, path) {
  if (/^([A-Za-z]:)?\//.test(path)) return path;
  const parts = base.replace(/\\/g, '/').split('/');
  for (const part of path.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}

async function mainRoot($, root) {
  let text;
  try {
    text = await $.fs.read(`${root}/.git`);
  } catch {
    return root;
  }
  const gitdir = typeof text === 'string' && text.startsWith('gitdir:') ? resolveFrom(root, text.slice('gitdir:'.length).trim().replace(/\\/g, '/')) : '';
  const at = gitdir.indexOf(WORKTREES_MARK);
  return at >= 0 ? gitdir.slice(0, at) : root;
}

async function readAllRuns($, root) {
  const main = await mainRoot($, root);
  const own = await readRuns($, `${root}/.exo/run`);
  const other = main === root ? [] : await readRuns($, `${main}/.exo/run`);
  const ids = new Set(own.map((run) => run.id));
  return [...own, ...other.filter((run) => !ids.has(run.id))].sort((a, b) => (a.id < b.id ? -1 : 1));
}

async function newestMtime($, dir) {
  try {
    const entries = await $.fs.list(dir);
    return Math.max(0, ...entries.map((entry) => entry.mtimeMs ?? 0));
  } catch {
    return Date.now();
  }
}

async function isLive($, run) {
  if (FINAL_PHASES.includes(run.state.phase)) return true;
  return Date.now() - (await newestMtime($, run.dir)) <= STALE_MS;
}

function statusLine(run, now) {
  const { landed = 0, total = 0, startedAt } = run.state;
  const minutes = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 60000));
  const filled = total ? Math.min(8, Math.floor((landed / total) * 8)) : 0;
  return `${'▰'.repeat(filled)}${'▱'.repeat(8 - filled)}  ${landed} of ${total}  ·  ${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

function wakeText(run) {
  const { phase, reason } = run.state;
  const head = `exo run ${run.id} ended ${phase}${reason ? `: ${reason}` : ''}.`;
  if (REPORT_PHASES.includes(phase)) return `${head} Report the result to the user.`;
  return `${head} Follow exo:spec references/watching.md to repair and resume.`;
}

async function readLog($, dir) {
  try {
    return await $.fs.read(`${dir}/run.log`);
  } catch {
    return '';
  }
}

async function wake($, context, run) {
  const before = context.seen.get(run.id);
  context.seen.set(run.id, run.state.phase);
  if (!FINAL_PHASES.includes(run.state.phase)) {
    context.notified.delete(run.id);
    return;
  }
  if (before === undefined || FINAL_PHASES.includes(before)) return;
  if (context.notified.has(run.id)) return;
  if (!context.sessionId || run.state.ownerSession !== context.sessionId) return;
  const log = await readLog($, run.dir);
  context.pending.set(run.id, { dir: run.dir, logLength: log.length });
}

async function agentLive($) {
  try {
    return (await $.agent.list()).some((agent) => LIVE_AGENT.includes(agent.status));
  } catch {
    return false;
  }
}

async function flush($, context) {
  if (await agentLive($)) return;
  for (const [id, stop] of context.pending) {
    context.pending.delete(id);
    const state = await readState($, `${stop.dir}/state.json`);
    if (context.notified.has(id) || !FINAL_PHASES.includes(state?.phase)) continue;
    const log = await readLog($, stop.dir);
    if (!RUN_START.test(log.slice(stop.logLength))) void $.prompt.submit({ text: wakeText({ id, state }) });
  }
}

async function tick($, context) {
  const root = await $.session.root();
  // why: the session id changes on /clear, so it is read on every tick.
  // why: a missing or throwing id counts as no match, so the status line still draws.
  context.sessionId = await Promise.resolve().then(() => $.session.id()).catch(() => undefined);
  const all =await readAllRuns($, root);
  const flags = await Promise.all(all.map((run) => isLive($, run)));
  const runs = all.filter((run, i) => flags[i]);
  for (const run of runs) {
    if (context.first && FINAL_PHASES.includes(run.state.phase)) context.seen.set(run.id, run.state.phase);
    else await wake($, context, run);
  }
  context.first = false;
  const own = runs.filter((run) => !FINAL_PHASES.includes(run.state.phase) && (run.dir.startsWith(`${root}/.exo/run/`) || run.state.runRoot === root));
  const newest = own[own.length - 1];
  // why: the engine draws no PromptHint row under a custom settings.statusLine; ui.status shows beside it.
  $.ui.status(newest ? statusLine(newest, await $.clock.now()) : undefined);
  if (!context.busy) await flush($, context);
}

async function noteNotification($, context, text) {
  const file = /<output-file>([^<]+)<\/output-file>/.exec(text)?.[1]?.trim();
  const output = file ? await $.fs.read(file).catch(() => '') : '';
  for (const id of context.seen.keys()) {
    if (!text.includes(id) && !new RegExp(`(^|\\n)exo: run ${id} `).test(output)) continue;
    context.pending.delete(id);
    context.notified.add(id);
  }
}

export function register(on) {
  const context = { first: true, busy: false, sessionId: undefined, seen: new Map(), pending: new Map(), notified: new Set() };
  on('session.start', ($, e, next) => {
    if (!e.isInteractive) return next(e);
    $.clock.every(TICK_MS, () => tick($, context));
    return next(e);
  });
  on('turn.start', ($, e, next) => {
    context.busy = true;
    return next(e);
  });
  on('turn.complete', async ($, e, next) => {
    context.busy = false;
    await flush($, context);
    return next(e);
  });
  on('session.receive', async ($, e, next) => {
    if (e.origin.kind === 'task-notification') await noteNotification($, context, e.text);
    return next(e);
  });
  on('prompt.submit', async ($, e, next) => {
    if (e.origin?.kind === 'task-notification') await noteNotification($, context, e.text);
    return next(e);
  });
}
