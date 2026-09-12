#!/usr/bin/env node
// Savings: what exo saved per session in lines, tokens, cost and time, an
// estimate against the benchmark ratios in ratios.mjs, net of exo's own
// overhead. The ledger is fed from the transcript the harness writes
// (transcript.mjs) and from the status line it renders.
//
//   node savings.mjs record      Stop hook: stdin is the hook JSON
//   node savings.mjs statusline  status line: stdin is the status JSON; prints one segment
//   node savings.mjs report      prints the totals as markdown
//   node savings.mjs status      prints on or off
//   node savings.mjs off | on    writes "enabled" into config.json: one switch for
//                                the ladder, the counter, the status line and the guard
//
// A hook failure never blocks the turn.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { configFile, ledgerFile, readJson, savingsEnabled, updateSession, writeJson } from './ledger.mjs';
import { overheadTotals } from './overhead.mjs';
import { countsCost } from './pricing.mjs';
import MEASURED from './ratios.mjs';
import { ingestTranscript, refreshStaleSessions, sumLines, sumTokens } from './transcript.mjs';

const DAY_MS = 24 * 60 * 60 * 1000;
const TREND_DAYS = 30;
const TREND_LEVELS = '▂▃▄▅▆▇█';
const TREND_FLOOR = '▁';
const TREND_LOSS = '-';
// One active day draws a single bar on a flat line, so the trend waits for a second.
const TREND_MIN_ACTIVE_DAYS = 2;
const PANEL_ROWS = {
  cost: 'cost at API price',
  lines: 'lines',
  tokens: 'tokens',
  time: 'time',
  trend: 'last 30 days'
};
const PROJECT_NAME_MAX = 28;
// MEASURED is the cut per metric exo's benchmark measured against a no-skill
// baseline, with its source; a ratio in config.json overrides it.
const PUBLISHED_RATIOS = { lines: MEASURED.lines, tokens: MEASURED.tokens, cost: MEASURED.cost, time: MEASURED.time };
// 0.1.x wrote these ratios into config.json on first load and on every
// switch, so a stored ratio still equal to its value here carries no edit of
// the user's.
const FIRST_LOAD_RATIOS = { lines: 0.54, tokens: 0.22, cost: 0.2, time: 0.27 };
const DEFAULT_CONFIG = { enabled: true, readGuard: true };

function loadConfig() {
  const existing = readJson(configFile(), null);
  if (existing === null) {
    writeJson(configFile(), DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG, ratios: PUBLISHED_RATIOS };
  }
  const stored = Object.entries(existing.ratios ?? {});
  const edited = Object.fromEntries(stored.filter(([metric, ratio]) => ratio !== FIRST_LOAD_RATIOS[metric]));
  return { ...DEFAULT_CONFIG, ...existing, ratios: { ...PUBLISHED_RATIOS, ...edited } };
}

// A session's gross cost priced from its usage, each call at its own model,
// or null when a call's model has no price. A row recorded before the model
// rode along with its usage is priced at the session's model.
function pricedCost(session) {
  const rows = Object.values(session.usageById ?? {});
  if (rows.length === 0) return null;
  let cost = 0;
  for (const counts of rows) {
    const rowCost = countsCost(counts, counts.model ?? session.model);
    if (rowCost === null) return null;
    cost += rowCost;
  }
  return cost;
}

function sessionMetrics(session) {
  const tokens = session.tokens ?? sumTokens({ usageById: session.usageById ?? {} });
  const lines = session.lines ?? sumLines({ linesByEntry: session.linesByEntry ?? {} });
  const elapsed = session.started && session.updated ? Date.parse(session.updated) - Date.parse(session.started) : 0;
  const overhead = overheadTotals(session);
  return {
    lines: lines.added,
    tokens: tokens.weightedInput + tokens.output,
    cost: session.costUsd ?? pricedCost(session),
    time: session.durationMs ?? elapsed,
    project: session.project ?? null,
    overhead: { tokens: overhead.tokens, cost: overhead.cost, time: overhead.time }
  };
}

// A session that wrote product code is what the benchmark measured: exo's
// ratios compare its exo arm, which paid exo's overhead, with a no-skill
// baseline, so it saves actual × r / (1 − r) and nothing more comes off. Any
// other session is outside every ratio and saves minus its overhead in
// tokens, cost and time. Lines are the code estimate alone: the lines exo's
// own process writes stay out of the product count that the ratio multiplies
// and are charged against nothing, because a markdown line of a brief is not
// a line of code. Cost is null when a price it needs is unknown.
function sessionSavings(metrics, ratios) {
  const estimate = (metric) => metrics[metric] * ratios[metric] / (1 - ratios[metric]);
  if (metrics.lines > 0) {
    return { lines: estimate('lines'), tokens: estimate('tokens'), cost: metrics.cost === null ? null : estimate('cost'), time: estimate('time') };
  }
  const overhead = metrics.overhead;
  return { lines: 0, tokens: -overhead.tokens, cost: overhead.cost === null ? null : -overhead.cost, time: -overhead.time };
}

// The scope's sessions summed; its cost is known only when every session's is.
function scopeSavings(sessions, ratios, include) {
  const total = { lines: 0, tokens: 0, cost: 0, costKnown: true, time: 0 };
  for (const session of Object.values(sessions)) {
    const metrics = sessionMetrics(session);
    if (!include(metrics)) continue;
    const saved = sessionSavings(metrics, ratios);
    total.lines += saved.lines;
    total.tokens += saved.tokens;
    total.time += saved.time;
    if (saved.cost === null) total.costKnown = false;
    else total.cost += saved.cost;
  }
  return total;
}

function compact(value) {
  // A value that rounds to zero prints 0, never -0.
  if (Math.round(value) < 0) return `-${compact(-value)}`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e4) return `${Math.round(value / 1e3)}k`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

function duration(milliseconds) {
  const minutes = Math.round(milliseconds / 60000);
  if (minutes < 0) return `-${duration(-milliseconds)}`;
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

// A loss prints its minus before the currency sign; a value that rounds to zero prints $0.00.
function money(value, known) {
  if (!known) return '-';
  if (Math.round(value * 100) < 0) return `-$${(-value).toFixed(2)}`;
  return `$${Math.abs(value).toFixed(2)}`;
}

function segment(saved) {
  return `saved ≈ ${compact(saved.lines)} LOC · ${compact(saved.tokens)} tok · ${money(saved.cost, saved.costKnown)} · ${duration(saved.time)}`;
}

function readStdin() {
  return JSON.parse(fs.readFileSync(0, 'utf8'));
}

// The project root a session first reports is its project; a later cd inside
// the session does not move it.
function claimProject(session, directory) {
  if (session.project !== null || typeof directory !== 'string') return false;
  session.project = directory;
  return true;
}

function record(hookInput) {
  if (!savingsEnabled()) return;
  if (typeof hookInput.session_id !== 'string') return;
  updateSession(hookInput.session_id, (session) => {
    const claimed = claimProject(session, process.env.CLAUDE_PROJECT_DIR || hookInput.cwd);
    const ingested = ingestTranscript(session, hookInput.transcript_path);
    return claimed || ingested;
  });
}

function statusline(statusInput) {
  if (!savingsEnabled()) return;
  const config = loadConfig();
  let sessions = readJson(ledgerFile(), {});
  if (typeof statusInput.session_id === 'string') {
    sessions = updateSession(statusInput.session_id, (session) => {
      let changed = ingestTranscript(session, statusInput.transcript_path);
      if (claimProject(session, statusInput.workspace?.project_dir ?? statusInput.cwd)) changed = true;
      const cost = statusInput.cost ?? {};
      if (typeof cost.total_cost_usd === 'number' && cost.total_cost_usd !== session.costUsd) {
        session.costUsd = cost.total_cost_usd;
        changed = true;
      }
      if (typeof cost.total_duration_ms === 'number' && cost.total_duration_ms !== session.durationMs) {
        session.durationMs = cost.total_duration_ms;
        changed = true;
      }
      return changed;
    });
  }
  const saved = scopeSavings(refreshStaleSessions(sessions), config.ratios, () => true);
  process.stdout.write(segment(saved));
}

function status() {
  process.stdout.write(`${savingsEnabled() ? 'on' : 'off'}\n`);
}

// Only "enabled" is written, so the published ratios keep reaching this install.
function setEnabled(enabled) {
  writeJson(configFile(), { ...readJson(configFile(), DEFAULT_CONFIG), enabled });
  process.stdout.write(`exo savings ${enabled ? 'on' : 'off'}; right-sizing follows at the next session start\n`);
}

// A recorded project may be a symlinked path while process.cwd() is resolved;
// a project directory that no longer exists compares as recorded.
function resolvedPath(directory) {
  try {
    return fs.realpathSync(directory);
  } catch {
    return directory;
  }
}

// The recorded project that holds the directory, the deepest when projects
// nest, so a report run from a subdirectory still finds its project.
function currentProject(sessions, directory) {
  let match = null;
  for (const session of Object.values(sessions)) {
    const project = session.project;
    if (typeof project !== 'string') continue;
    const resolved = resolvedPath(project);
    const inside = directory === resolved || directory.startsWith(`${resolved}${path.sep}`);
    if (inside && (match === null || project.length > match.length)) match = project;
  }
  return match ?? directory;
}

// One table column, keyed like PANEL_ROWS: the scope's net saving.
function scopeColumn(title, sessions, ratios, include) {
  const saved = scopeSavings(sessions, ratios, include);
  const days = dailySavings(sessions, ratios, Date.now(), include);
  return {
    title,
    cells: {
      cost: money(saved.cost, saved.costKnown),
      lines: compact(saved.lines),
      tokens: compact(saved.tokens),
      time: duration(saved.time),
      trend: `\`${trendLine(days)}\``
    },
    saved,
    days,
    activeDays: days.filter((value) => value !== 0).length
  };
}

// The net cost saved per local day, oldest first, ending today; a session
// whose cost saving is unknown is left out.
function dailySavings(sessions, ratios, now, include) {
  const days = new Array(TREND_DAYS).fill(0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  for (const session of Object.values(sessions)) {
    const metrics = sessionMetrics(session);
    if (!include(metrics) || typeof session.started !== 'string') continue;
    const cost = sessionSavings(metrics, ratios).cost;
    if (cost === null) continue;
    const day = new Date(session.started);
    day.setHours(0, 0, 0, 0);
    // Rounded, because a day across a daylight-saving change is 23 or 25 hours.
    const age = Math.round((today - day) / DAY_MS);
    if (age < 0 || age >= TREND_DAYS) continue;
    days[TREND_DAYS - 1 - age] += cost;
  }
  return days;
}

// A day without a saving sits on the floor glyph, a net loss draws a minus,
// and a saving rises above the floor in proportion to the best day.
function trendLine(days) {
  const peak = Math.max(...days);
  return days.map((value) => {
    if (value < 0) return TREND_LOSS;
    if (value === 0) return TREND_FLOOR;
    const level = Math.ceil((value / peak) * TREND_LEVELS.length) - 1;
    return TREND_LEVELS[level];
  }).join('');
}

// Markdown, not a drawn box: the model relays it unfenced, so Claude Code's own
// renderer styles the title, the table and the inline code. One table is the
// whole report; the totals are its rightmost column, not a second claim above it.
function report() {
  const config = loadConfig();
  const sessions = refreshStaleSessions(readJson(ledgerFile(), {}));
  const project = currentProject(sessions, process.cwd());
  const baseName = path.basename(project);
  const shortName = baseName.length > PROJECT_NAME_MAX ? `${baseName.slice(0, PROJECT_NAME_MAX - 1)}…` : baseName;
  // A pipe in a directory name would end the table cell.
  const projectName = shortName.replaceAll('|', '\\|');
  const inProject = (metrics) => metrics.project === project;
  // Short scope titles, so the headline figure sits directly under the word that scopes it.
  const here = scopeColumn(`in ${projectName}`, sessions, config.ratios, inProject);
  const everywhere = scopeColumn('everywhere', sessions, config.ratios, () => true);
  const enabled = savingsEnabled();
  const state = enabled ? '● on' : '○ off';
  const toggle = enabled ? 'Turn off with `/exo:savings off`.' : 'Turn on with `/exo:savings on`.';
  const labels = { ...PANEL_ROWS };
  // Every scope's active days are a subset of all projects' days.
  if (everywhere.activeDays < TREND_MIN_ACTIVE_DAYS) delete labels.trend;
  const rows = Object.entries(labels).map(([key, label]) => `| ${label} | ${here.cells[key]} | ${everywhere.cells[key]} |`);
  const lines = [
    `**✻ exo savings** · ${state}`,
    '',
    `| ≈ saved | ${here.title} | ${everywhere.title} |`,
    '|:--|--:|--:|',
    ...rows,
    '',
    toggle
  ];
  const override = process.env.EXO_SAVINGS;
  if (override === 'on' || override === 'off') lines.push('', `EXO_SAVINGS=${override} in the environment outranks the switch.`);
  process.stdout.write(`${lines.join('\n')}\n`);
}

const command = process.argv[2];
const HOOK_COMMANDS = { record, statusline };
const CLI_COMMANDS = { report, status, on: () => setEnabled(true), off: () => setEnabled(false) };
if (command in HOOK_COMMANDS) {
  try {
    HOOK_COMMANDS[command](readStdin());
  } catch (error) {
    // A ledger fault must never block a turn or blank the status line.
    console.error(`savings: ${error.message}`);
  }
} else if (command in CLI_COMMANDS) {
  try {
    CLI_COMMANDS[command]();
  } catch (error) {
    // A CLI command's caller needs the failure surfaced.
    console.error(`savings: ${error.message}`);
    process.exit(1);
  }
} else {
  console.error('usage: savings.mjs record|statusline|report|status|on|off');
  process.exit(1);
}
