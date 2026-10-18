// Session durations (duration_ms of the result line) for tail logs and task iter logs per kept worktree dir.
// Usage: node tail.mjs <keptDir> <name>...
import fs from 'node:fs'; import path from 'node:path';
const [kept, ...names] = process.argv.slice(2);
for (const n of names) {
  const root = path.join(kept, n, 'run-plan'); const out = {};
  for (const p of fs.readdirSync(root)) { const pd = path.join(root, p); if (!fs.statSync(pd).isDirectory()) continue;
    for (const ts of fs.readdirSync(pd)) { const d = path.join(pd, ts); if (!fs.statSync(d).isDirectory()) continue;
      for (const f of fs.readdirSync(d).filter(f => /^(tail|iter)-.*\.log$/.test(f))) {
        const txt = fs.readFileSync(path.join(d, f), 'utf8'); const m = [...txt.matchAll(/"duration_ms":(\d+)/g)].pop();
        const kind = f.replace(/^(tail|iter)-\d+-/, '').replace(/-\d+\.log$|\.log$/, '').replace(/^task.*/, 'task');
        out[kind] = out[kind] || []; out[kind].push(m ? Math.round(m[1] / 1000) : 'na'); } } }
  console.log(n.padEnd(22), Object.entries(out).map(([k, v]) => `${k}=[${k === 'task' ? v.reduce((a, b) => a + (+b || 0), 0) + 's sum' : v.join(',')}]`).join(' '));
}
