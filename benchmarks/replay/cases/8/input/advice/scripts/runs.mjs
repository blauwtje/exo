// Per-run phase times and cost by kind for kept exo runs.
// Usage: node runs.mjs <keptDir> <runId>...
import fs from 'node:fs'; import path from 'node:path';
const [kept, ...ids] = process.argv.slice(2);
const sec = t => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + s; };
const tot = {};
for (const id of ids) {
  const st = JSON.parse(fs.readFileSync(path.join(kept, id, 'state.json'), 'utf8'));
  const log = fs.readFileSync(path.join(kept, id, 'run.log'), 'utf8').split('\n');
  const ph = { task: 0, success: 0, review: 0, fix: 0, fixrev: 0, stopwait: 0 }; let prev = null, mode = 'task', stopAt = null;
  const ev = []; for (const l of log) { const m = l.match(/^\[(\d\d:\d\d:\d\d)\] (.*)$/); if (m) ev.push([sec(m[1]), m[2]]); }
  for (let i = 0; i < ev.length; i++) {
    const [t, e] = ev[i];
    if (prev !== null && t >= prev) { const d = t - prev; if (stopAt === null) ph[mode] += d; }
    if (/^run stopped/.test(e)) { stopAt = t; }
    if (/^run start/.test(e)) { if (stopAt !== null) ph.stopwait += 0; stopAt = null; mode = 'task'; }
    if (/final review start/.test(e)) mode = 'success';
    if (/^review start/.test(e)) mode = 'review';
    if (/^fix (start|retry start)/.test(e)) mode = 'fix';
    if (/^fix review start/.test(e)) mode = 'fixrev';
    if (/^(fix landed|average per task|run done)/.test(e)) mode = 'end';
    ph.end = 0; prev = t;
  }
  delete ph.end;
  const costLines = log.filter(l => /^Cost \$/.test(l)).map(l => l.match(/Cost \$([\d.]+), time (.*)\./));
  const wt = path.join(kept, path.basename(st.runRoot), 'run-plan');
  const kinds = {}; let n = 0;
  if (fs.existsSync(wt)) for (const p of fs.readdirSync(wt)) { const pd = path.join(wt, p); if (!fs.statSync(pd).isDirectory()) continue;
    for (const ts of fs.readdirSync(pd)) { const f = path.join(pd, ts, 'sessions.jsonl'); if (!fs.existsSync(f)) continue;
      for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) { const r = JSON.parse(l); const k = r.kind + (r.model ? '/' + r.model.replace(/claude-|-5-5/g, '') : ''); kinds[k] = (kinds[k] || 0) + r.costUsd; n++; } } }
  const cost = Object.values(kinds).reduce((a, b) => a + b, 0);
  const tasks = log.filter(l => /task \d+ landed/.test(l)).length;
  const fails = log.filter(l => /task \d+ (failed|blocked)/.test(l)).length;
  console.log(`${id.slice(-4)} ${path.basename(st.runRoot).padEnd(22)} tasks=${tasks} fails=${fails} cost=${costLines.map(c => c[1]).join('+')} time=${costLines.map(c => c[2]).join('+')} ledger=$${cost.toFixed(2)} n=${n}`);
  console.log('   sec ' + Object.entries(ph).map(([k, v]) => `${k}=${v}`).join(' '));
  console.log('   $ ' + Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(' '));
  for (const [k, v] of Object.entries(ph)) tot['s_' + k] = (tot['s_' + k] || 0) + v;
  for (const [k, v] of Object.entries(kinds)) tot[k] = (tot[k] || 0) + v;
}
console.log('TOTAL ' + Object.entries(tot).map(([k, v]) => `${k}=${k.startsWith('s_') ? v : v.toFixed(2)}`).join(' '));
