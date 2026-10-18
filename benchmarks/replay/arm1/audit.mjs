#!/usr/bin/env node
// Measurement audit of a benchmark data dir; rules and thresholds in audit-spec.md.
// Usage: node audit.mjs <dir>. Markdown on stdout, facts only, exit 0.
import fs from 'node:fs';
import path from 'node:path';

const PEER_RATIO = 3;
const PEER_MIN = 3;
const OFF_API_MS = 60000;
const OFF_API_SHARE = 0.5;
const SLEEP_SECONDS = 30;
const USAGE_EXCESS = 0.05;
const OUTCOME_K = 3;
const CHECKS = ['wall-time', 'stop-reason', 'dirty-tree', 'usage-repeat', 'cost-key', 'one-outcome'];
const CODE_EXT = new Set(['.mjs', '.js', '.cjs', '.ts']);
const TEXT_EXT = new Set(['.md', '.log', '.txt', '']);
const EFFORTS = 'low|medium|high|xhigh|max';

const root = path.resolve(process.argv[2] ?? '.');
const flags = [];
const misses = [];
const flag = (check, fact, file, line) => flags.push(`FLAG ${check}: ${fact} (${file}:${line})`);
const miss = (check, fact) => misses.push(`MISS ${check}: ${fact}`);
const fmt = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(Math.abs(n) < 1 ? 4 : 2));

function walk(dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') walk(full, out);
    } else if (entry.isFile() && entry.name !== 'audit.md') out.push(full);
  }
  return out;
}

// ---- parsers ----
const records = []; // { file, line, obj, kind }
const jsonlFiles = []; // { file, entries: [{ line, obj }] }
const textFiles = []; // { file, lines }
const codeFiles = []; // { file, lines, text }
const metaByDir = new Map();

function lineAt(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

function collectJson(file, text, value) {
  let cursor = 0;
  const visit = (node, depth) => {
    if (Array.isArray(node)) { node.forEach((item) => visit(item, depth + 1)); return; }
    if (node === null || typeof node !== 'object') return;
    const keys = Object.keys(node);
    let line = 1;
    if (depth > 0 && keys.length > 0) {
      const at = text.indexOf(JSON.stringify(keys[0]), cursor);
      if (at >= 0) { line = lineAt(text, at); cursor = at + 1; }
    }
    records.push({ file, line, obj: node, kind: 'json' });
    for (const key of keys) visit(node[key], depth + 1);
  };
  visit(value, 0);
}

function parseDuration(raw) {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  let total = 0;
  let matched = false;
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(ms|h|hours?|min|minutes?|m|s|sec|seconds?)\b/g)) {
    matched = true;
    const n = Number(m[1]);
    const u = m[2];
    total += u === 'ms' ? n : u.startsWith('h') ? n * 3600000 : u.startsWith('m') ? n * 60000 : n * 1000;
  }
  return matched ? total : null;
}

function parseNumber(raw) {
  if (typeof raw === 'number') return raw;
  if (typeof raw !== 'string') return null;
  const m = raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?\s*([km])?\b/i);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return m[1]?.toLowerCase() === 'k' ? n * 1000 : m[1]?.toLowerCase() === 'm' ? n * 1e6 : n;
}

function parseTables(file, lines) {
  for (let i = 0; i + 1 < lines.length; i += 1) {
    if (!/^\s*\|/.test(lines[i]) || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) continue;
    const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const header = cells(lines[i]).map((h) => h.toLowerCase());
    let j = i + 2;
    for (; j < lines.length && /^\s*\|/.test(lines[j]); j += 1) {
      const row = cells(lines[j]);
      const obj = {};
      header.forEach((h, k) => { obj[h] = row[k] ?? ''; });
      records.push({ file, line: j + 1, obj, kind: 'table' });
    }
    i = j - 1;
  }
}

// score.mjs style blocks: "<name>: n=<k>" then indented "key mean value" lines.
function parseBlocks(file, lines) {
  for (let i = 0; i < lines.length; i += 1) {
    const head = lines[i].match(/^(\S+):\s*n=(\d+)\s*$/);
    if (!head) continue;
    const obj = { arm: head[1], n: Number(head[2]) };
    for (let j = i + 1; j < lines.length && /^\s+\S/.test(lines[j]); j += 1) {
      const l = lines[j].trim();
      let m;
      if ((m = l.match(/^weighted tokens mean (\d+(?:\.\d+)?)$/))) obj.tokens = Number(m[1]);
      else if ((m = l.match(/^cost mean \$(\d+(?:\.\d+)?)/))) obj.costUsd = Number(m[1]);
      else if ((m = l.match(/^wall time mean (\d+(?:\.\d+)?) min$/))) obj.wallMs = Number(m[1]) * 60000;
      else if ((m = l.match(/^hidden pass (\d+)\/(\d+)/))) { obj.passes = Number(m[1]); obj.of = Number(m[2]); }
    }
    records.push({ file, line: i + 1, obj, kind: 'block' });
  }
}

// Run-log lines: "task <id> start: ... · <model> <effort>" and
// "task <id> <verb> ... · <dur> · <n> turns · <n>k tokens · $<x>".
function parseLog(file, lines) {
  const startOf = new Map();
  lines.forEach((l, i) => {
    const start = l.match(new RegExp(`\\btask (\\S+) start\\b.*·\\s*(\\S+)\\s+(${EFFORTS})\\s*$`));
    if (start) { startOf.set(start[1], { model: start[2], effort: start[3] }); return; }
    const end = l.match(/\btask (\S+) (\w+)\b(.*)$/);
    if (!end || !/·/.test(end[3])) return;
    const parts = end[3].split('·').map((p) => p.trim());
    const obj = { task: end[1], status: end[2], ...(startOf.get(end[1]) ?? {}) };
    for (const p of parts) {
      if (/^\d+(?:\.\d+)?\s*(ms|s|m|min|h)$/.test(p) || /^\d+m\s*\d+s$/.test(p)) obj.wallMs = parseDuration(p);
      else if (/tokens$/.test(p)) obj.tokens = parseNumber(p);
      else if (/^\$\d/.test(p)) obj.costUsd = parseNumber(p);
    }
    records.push({ file, line: i + 1, obj, kind: 'log' });
  });
}

for (const full of walk(root)) {
  const file = path.relative(root, full);
  const ext = path.extname(full).toLowerCase();
  let text;
  try { text = fs.readFileSync(full, 'utf8'); } catch { miss(CHECKS.join(', '), `${file} unreadable`); continue; }
  const lines = text.split('\n');
  if (ext === '.json') {
    try {
      const value = JSON.parse(text);
      collectJson(file, text, value);
      if (path.basename(full) === 'meta.json') metaByDir.set(path.dirname(full), value);
    } catch { miss(CHECKS.join(', '), `${file} unparsable`); }
  } else if (ext === '.jsonl' || ext === '.ndjson') {
    const entries = [];
    let bad = 0;
    lines.forEach((l, i) => {
      if (!l.trim()) return;
      try {
        const obj = JSON.parse(l);
        entries.push({ line: i + 1, obj });
        records.push({ file, line: i + 1, obj, kind: 'jsonl' });
      } catch { bad += 1; }
    });
    if (bad > 0) miss('usage-repeat, stop-reason, wall-time', `${file} ${bad} unparsable lines`);
    jsonlFiles.push({ file, entries });
  } else if (CODE_EXT.has(ext)) {
    codeFiles.push({ file, lines, text });
  } else if (TEXT_EXT.has(ext)) {
    textFiles.push({ file, lines });
    parseTables(file, lines);
    parseBlocks(file, lines);
    parseLog(file, lines);
  }
}

// ---- field access ----
function field(obj, names, headerTest) {
  for (const n of names) if (obj[n] !== undefined && obj[n] !== null && obj[n] !== '') return { key: n, value: obj[n] };
  if (headerTest) for (const k of Object.keys(obj)) if (headerTest(k) && obj[k] !== '') return { key: k, value: obj[k] };
  return null;
}
function wallOf(rec) {
  const f = field(rec.obj, ['wallMs', 'wall_ms', 'duration_ms'], rec.kind === 'table' ? (k) => /wall|^time$|\bmin\b/.test(k) : null);
  if (!f) return null;
  const v = f.key.endsWith('Ms') || f.key.endsWith('_ms') ? (typeof f.value === 'number' ? f.value : parseNumber(f.value)) : parseDuration(f.value);
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}
function workOf(rec, which) {
  const names = which === 'tokens' ? ['tokens', 'outputTokens'] : ['costUsd', 'total_cost_usd', 'cost'];
  const test = rec.kind === 'table' ? (which === 'tokens' ? (k) => /token/.test(k) : (k) => /cost|\$/.test(k)) : null;
  const f = field(rec.obj, names, test);
  if (!f) return null;
  const v = parseNumber(f.value);
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}
function costOf(obj, kind) {
  const f = field(obj, ['costUsd', 'total_cost_usd', 'costUSD', 'cost'], kind === 'table' ? (k) => /cost|\$/.test(k) : null);
  if (!f) return null;
  const v = parseNumber(f.value);
  return typeof v === 'number' ? v : null;
}
const label = (rec) => {
  const f = field(rec.obj, ['id', 'task', 'cell', 'arm', 'name'], rec.kind === 'table' ? () => true : null);
  return f ? String(f.value) : `record at line ${rec.line}`;
};
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ---- 1. wall-time ----
{
  let inputs = 0;
  const byFile = new Map();
  for (const rec of records) {
    if (rec.kind === 'jsonl' && rec.obj?.type !== 'result') continue;
    const wall = wallOf(rec);
    if (wall === null) continue;
    (byFile.get(rec.file) ?? byFile.set(rec.file, []).get(rec.file)).push({ rec, wall });
  }
  for (const [file, rows] of byFile) {
    for (const which of ['tokens', 'cost']) {
      const peers = rows.map((r) => ({ ...r, work: workOf(r.rec, which) })).filter((r) => r.work !== null);
      if (peers.length < PEER_MIN) continue;
      inputs += 1;
      const ratios = peers.map((p) => p.wall / p.work);
      const med = median(ratios);
      peers.forEach((p, i) => {
        const ratio = ratios[i] / med;
        if (ratio >= PEER_RATIO) {
          flag('wall-time', `${label(p.rec)} wall ${fmt(p.wall / 1000)} s per ${fmt(p.work)} ${which}, ${fmt(ratio)}x the median wall per ${which === 'tokens' ? 'token' : 'dollar'} of ${peers.length} rows in this file`, file, p.rec.line);
        }
      });
      break;
    }
  }
  for (const rec of records) {
    const o = rec.obj;
    if (typeof o?.duration_ms !== 'number' || typeof o?.duration_api_ms !== 'number') continue;
    inputs += 1;
    const gap = o.duration_ms - o.duration_api_ms;
    if (gap >= OFF_API_MS && gap >= OFF_API_SHARE * o.duration_ms) {
      flag('wall-time', `duration_ms ${o.duration_ms}, duration_api_ms ${o.duration_api_ms}: ${fmt(gap / 1000)} s (${fmt((100 * gap) / o.duration_ms)}%) of wall time outside API calls`, rec.file, rec.line);
    }
  }
  const sleepRe = /\bsleep\s+(\d+(?:\.\d+)?)/g;
  for (const { file, entries } of jsonlFiles) {
    inputs += 1;
    let total = 0;
    let first = null;
    for (const { line, obj } of entries) {
      for (const block of Array.isArray(obj?.message?.content) ? obj.message.content : []) {
        const cmd = block?.type === 'tool_use' && typeof block.input?.command === 'string' ? block.input.command : null;
        if (!cmd) continue;
        for (const m of cmd.matchAll(sleepRe)) { total += Number(m[1]); first ??= line; }
      }
    }
    if (total >= SLEEP_SECONDS) flag('wall-time', `tool commands sleep ${fmt(total)} s in total`, file, first);
  }
  for (const { file, lines } of textFiles) {
    if (!/\.(log|txt)$/i.test(file)) continue;
    inputs += 1;
    let total = 0;
    let first = null;
    lines.forEach((l, i) => { for (const m of l.matchAll(sleepRe)) { total += Number(m[1]); first ??= i + 1; } });
    if (total >= SLEEP_SECONDS) flag('wall-time', `log lines sleep ${fmt(total)} s in total`, file, first);
  }
  if (inputs === 0) miss('wall-time', 'no rows with wall time and tokens or cost (3+ per file), result durations, transcripts or logs found');
}

// ---- 2. stop-reason ----
{
  let inputs = 0;
  for (const rec of records) {
    const o = rec.obj;
    if (!o || typeof o !== 'object') continue;
    const has = ['subtype', 'timedOut', 'stop_reason', 'is_error'].some((k) => k in o);
    if (!has) continue;
    inputs += 1;
    const facts = [];
    if (typeof o.subtype === 'string' && o.subtype.startsWith('error_max')) facts.push(`subtype ${o.subtype}`);
    if (o.timedOut === true) facts.push('timedOut true');
    if (o.stop_reason === 'max_tokens') facts.push('stop_reason max_tokens');
    if (o.is_error === true && o.subtype !== 'success' && !facts.some((f) => f.startsWith('subtype'))) facts.push(`is_error true, subtype ${o.subtype ?? 'absent'}`);
    if (facts.length) flag('stop-reason', `${label(rec)}: ${facts.join(', ')}`, rec.file, rec.line);
  }
  const stopWord = /\b(stop|stops|stopped|parked|ended|halted|abort|aborted)\b/i;
  const limitWord = /\b(cap|caps|capped|budget|max[-_ ]turns|timeout|timed out|limit|limits)\b/i;
  for (const { file, lines } of textFiles) {
    inputs += 1;
    lines.forEach((l, i) => {
      const s = l.match(stopWord);
      const c = l.match(limitWord);
      if (s && c) flag('stop-reason', `line holds "${s[0]}" and "${c[0]}": ${l.trim().slice(0, 140)}`, file, i + 1);
    });
  }
  if (inputs === 0) miss('stop-reason', 'no result records or text lines found');
}

// ---- 3. dirty-tree ----
{
  let inputs = 0;
  const truthy = (v) => v === true || (typeof v === 'string' && v.trim() !== '' && v !== 'false') || (v && typeof v === 'object' && Object.values(v).some(truthy));
  for (const rec of records) {
    if (rec.kind !== 'json' && rec.kind !== 'jsonl') continue;
    for (const [k, v] of Object.entries(rec.obj ?? {})) {
      if (!/dirty/i.test(k)) continue;
      inputs += 1;
      if (truthy(v)) flag('dirty-tree', `${k} = ${JSON.stringify(v).slice(0, 120)}`, rec.file, rec.line);
    }
  }
  for (const { file, lines } of textFiles) {
    inputs += 1;
    lines.forEach((l, i) => {
      if (/^( M|M |A |D |\?\?|MM| D|R ) +\S/.test(l) && lines.slice(Math.max(0, i - 3), i).some((p) => /git status|dirty/i.test(p))) {
        flag('dirty-tree', `git status line: ${l.trim()}`, file, i + 1);
      } else if (/dirty/i.test(l) && /\b(true|yes)\b/i.test(l)) {
        flag('dirty-tree', `line: ${l.trim().slice(0, 140)}`, file, i + 1);
      }
    });
  }
  if (inputs === 0) miss('dirty-tree', 'no dirty keys or text lines found');
}

// ---- 4. usage-repeat ----
{
  let inputs = 0;
  for (const { file, entries } of jsonlFiles) {
    const lines = entries.filter((e) => e.obj?.type === 'assistant' && e.obj.message?.id && e.obj.message.usage);
    if (lines.length === 0) continue;
    inputs += 1;
    const byId = new Map();
    for (const e of lines) (byId.get(e.obj.message.id) ?? byId.set(e.obj.message.id, []).get(e.obj.message.id)).push(e);
    const repeated = [...byId.values()].filter((list) => list.length > 1);
    if (repeated.length === 0) continue;
    const out = (u) => Number(u.output_tokens) || 0;
    const inp = (u) => (Number(u.input_tokens) || 0) + (Number(u.cache_read_input_tokens) || 0) + (Number(u.cache_creation_input_tokens) || 0);
    const sum = (list, f) => list.reduce((s, e) => s + f(e.obj.message.usage), 0);
    const perId = (f) => [...byId.values()].reduce((s, list) => s + f(list[list.length - 1].obj.message.usage), 0);
    let measure = 'output_tokens';
    let perLine = sum(lines, out);
    let perIdSum = perId(out);
    if (perLine === perIdSum) { measure = 'input+cache tokens'; perLine = sum(lines, inp); perIdSum = perId(inp); }
    if (perIdSum > 0 && (perLine - perIdSum) / perIdSum >= USAGE_EXCESS) {
      const lineCount = repeated.reduce((s, l) => s + l.length, 0);
      flag('usage-repeat', `${repeated.length} of ${byId.size} message ids appear on ${lineCount} usage lines; ${measure} summed per line ${perLine}, per message id ${perIdSum}`, file, repeated[0][1].line);
    }
  }
  for (const { file, lines, text } of codeFiles) {
    if (!/usage/.test(text)) continue;
    inputs += 1;
    if (/message\??\.id/.test(text) || !/jsonl|split\(\s*['"]\\n['"]\s*\)|readline/.test(text)) continue;
    lines.forEach((l, i) => {
      if (/usage\??\.\w+/.test(l) && /\+=|\+\s*[\w.?]*usage|reduce\(/.test(l)) flag('usage-repeat', `code sums usage fields per transcript line; file never reads message.id: ${l.trim().slice(0, 120)}`, file, i + 1);
    });
  }
  if (inputs === 0) miss('usage-repeat', 'no transcript lines with message.id and usage, or usage code, found');
}

// ---- 5. cost-key ----
{
  let inputs = 0;
  const metaFor = (file) => {
    for (let d = path.dirname(path.join(root, file)); d.startsWith(root); d = path.dirname(d)) {
      if (metaByDir.has(d)) return metaByDir.get(d);
      if (d === root) break;
    }
    return null;
  };
  const groups = new Map();
  for (const rec of records) {
    const o = rec.obj;
    if (!o || typeof o !== 'object' || costOf(o, rec.kind) === null) continue;
    const key = field(o, ['id', 'task', 'cell']);
    if (!key) continue;
    inputs += 1;
    const g = `${rec.kind}\u0000${key.value}`;
    (groups.get(g) ?? groups.set(g, []).get(g)).push(rec);
    const meta = metaFor(rec.file) ?? {};
    const missing = ['model', 'effort'].filter((k) => !(o[k] || meta[k]));
    if (missing.length) flag('cost-key', `${key.key} ${key.value} has a cost and no ${missing.join(' or ')} in the record or its meta.json`, rec.file, rec.line);
  }
  for (const [, list] of groups) {
    for (const k of ['model', 'effort']) {
      const values = new Set(list.map((r) => r.obj[k]).filter(Boolean));
      if (values.size > 1) flag('cost-key', `key ${label(list[0])} holds cost records of ${values.size} ${k} values (${[...values].join(', ')})`, list[0].file, list[0].line);
    }
  }
  for (const { file, lines, text } of codeFiles) {
    if (!/costUsd|total_cost_usd|costUSD|\bcost\b/.test(text)) continue;
    const keyLines = [];
    lines.forEach((l, i) => {
      for (const m of l.matchAll(/\.(?:set|get)\(([^,)]+)|\[([^\]]+)\]\s*=(?!=)|groupBy\(([^)]*)\)/g)) keyLines.push({ line: i + 1, expr: (m[1] ?? m[2] ?? m[3]).trim(), text: l });
    });
    if (keyLines.length === 0) continue;
    inputs += 1;
    if (keyLines.some((k) => /model|effort/i.test(k.expr))) continue;
    for (const k of keyLines.filter((x) => /\.set\(|\]\s*=|groupBy/.test(x.text))) {
      flag('cost-key', `file reads a cost field and keys by \`${k.expr}\`; no key expression in the file names model or effort`, file, k.line);
    }
  }
  if (inputs === 0) miss('cost-key', 'no keyed cost records or cost-grouping code found');
}

// ---- 6. one-outcome ----
{
  let inputs = 0;
  const outcomeOf = (o, kind) => {
    for (const k of ['outcome', 'pass', 'passed', 'success', 'correct', 'result', 'harm', 'suiteGreen']) {
      const v = o[k];
      if (typeof v === 'boolean') return { key: k, value: v, fail: k === 'harm' ? v : !v };
      if (typeof v === 'string' && /^(pass|passed|fail|failed|ok|error)$/i.test(v.trim())) return { key: k, value: v.trim().toLowerCase(), fail: /^(fail|failed|error)$/i.test(v.trim()) };
      if (k === 'outcome' && typeof v === 'string' && v.length <= 40 && kind !== 'table') return { key: k, value: v, fail: null };
    }
    return null;
  };
  const groups = new Map();
  for (const rec of records) {
    const o = rec.obj;
    if (!o || typeof o !== 'object') continue;
    const out = outcomeOf(o, rec.kind);
    if (!out) continue;
    const t = field(o, ['task', 'case']) ?? field(o, ['id']);
    if (!t) continue;
    const task = t.key === 'id' ? String(t.value).replace(/[-_#]?\d+$/, '') : String(t.value);
    const arm = o.arm ?? o.variant ?? '';
    const g = `${rec.kind}\u0000${task}\u0000${arm}`;
    (groups.get(g) ?? groups.set(g, { task, arm, list: [] }).get(g)).list.push({ rec, out, expected: field(o, ['expected', 'expect', 'label', 'expectedOutcome']) });
  }
  for (const { task, arm, list } of groups.values()) {
    inputs += 1;
    if (list.length < OUTCOME_K) continue;
    const values = new Set(list.map((x) => String(x.out.value)));
    if (values.size !== 1) continue;
    const value = [...values][0];
    const exp = list.find((x) => x.expected)?.expected;
    const head = list[0].rec;
    if (exp && String(exp.value).toLowerCase() !== value.toLowerCase()) {
      flag('one-outcome', `task ${task}${arm ? ` arm ${arm}` : ''}: all ${list.length} runs ${list[0].out.key} ${value}, ${exp.key} ${exp.value}`, head.file, head.line);
    } else if (!exp && list[0].out.fail === true) {
      flag('one-outcome', `task ${task}${arm ? ` arm ${arm}` : ''}: 0/${list.length} runs pass (${list[0].out.key} ${value}), no expected label recorded`, head.file, head.line);
    }
  }
  if (inputs === 0) miss('one-outcome', 'no records with a task key and an outcome found');
  else if (![...groups.values()].some((g) => g.list.length >= OUTCOME_K)) miss('one-outcome', `no task with ${OUTCOME_K}+ runs found (largest K ${Math.max(...[...groups.values()].map((g) => g.list.length))})`);
}

const out = ['# Measurement audit', '', `dir: ${path.basename(root)}`, ''];
out.push(...(flags.length ? flags : ['no flags']));
if (misses.length) out.push('', ...misses);
out.push('', `checks: ${CHECKS.length}, flags: ${flags.length}`);
console.log(out.join('\n'));
process.exit(0);
