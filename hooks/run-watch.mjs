const FINAL_PHASES = ['passed', 'landed', 'parked', 'stopped', 'refused', 'crashed'];
const TICK_MS = 5000;
const REPORT_PHASES = ['landed', 'passed'];

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

async function readRuns($, root) {
  const base = `${root}/.exo/run`;
  let entries;
  try {
    entries = await $.fs.list(base);
  } catch {
    return [];
  }
  const dirs = entries.filter((entry) => entry.kind === 'dir').sort((a, b) => (a.name < b.name ? -1 : 1));
  const runs = [];
  for (const dir of dirs) {
    const state = await readState($, `${base}/${dir.name}/state.json`);
    if (state) runs.push({ id: dir.name, state });
  }
  return runs;
}

function statusLine(run, now) {
  const { task, landed, total, startedAt } = run.state;
  const minutes = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 60000));
  const subject = task?.subject ?? '';
  return `exo ▸ task ${task?.n ?? 0}/${total ?? 0} ${subject} · ${landed ?? 0} landed · ${minutes}m`;
}

function wakeText(run) {
  const { phase, reason } = run.state;
  const head = `exo run ${run.id} ended ${phase}${reason ? `: ${reason}` : ''}.`;
  if (REPORT_PHASES.includes(phase)) return `${head} Report the result to the user.`;
  return `${head} Follow exo:build references/run-loop.md to repair and resume.`;
}

function wake($, seen, run) {
  const before = seen.get(run.id);
  seen.set(run.id, run.state.phase);
  const final = FINAL_PHASES.includes(run.state.phase);
  if (before !== undefined && !FINAL_PHASES.includes(before) && final) {
    void $.prompt.submit({ text: wakeText(run) });
  }
}

async function tick($, context) {
  const root = await $.session.root();
  const runs = (await readRuns($, root)).filter((run) => !(Date.parse(run.state.updatedAt) < context.startedAt));
  for (const run of runs) {
    if (context.first && FINAL_PHASES.includes(run.state.phase)) context.seen.set(run.id, run.state.phase);
    else wake($, context.seen, run);
  }
  context.first = false;
  const active = runs.filter((run) => !FINAL_PHASES.includes(run.state.phase));
  const newest = active[active.length - 1];
  $.ui.status(newest ? statusLine(newest, Date.now()) : undefined);
}

export function register(on) {
  on('session.start', (e, $, next) => {
    if (!e.isInteractive) return next(e);
    const context = { startedAt: Date.now(), first: true, seen: new Map() };
    $.clock.every(TICK_MS, () => tick($, context));
    return next(e);
  });
}
