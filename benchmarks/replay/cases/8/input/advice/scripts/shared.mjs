// For each plan: task count and file paths listed by more than one task (why auto session mode chose task over plan).
// Usage: node shared.mjs <plan.md>...
import fs from 'node:fs'; import { pathToFileURL } from 'node:url'; import path from 'node:path';
const mod = await import(pathToFileURL(path.resolve('lib/plan-tasks.mjs')));
const parse = mod.parsePlan ?? mod.parsePlanTasks ?? mod.default ?? Object.values(mod).find(f => typeof f === 'function');
for (const p of process.argv.slice(2)) {
  const plan = parse(fs.readFileSync(p, 'utf8')); const tasks = plan.tasks ?? plan; const c = {};
  for (const t of tasks) for (const f of new Set((t.files ?? []).map(f => f.path))) c[f] = (c[f] || 0) + 1;
  console.log(path.basename(p), 'tasks=' + tasks.length, 'shared=' + Object.entries(c).filter(([, n]) => n > 1).map(([f, n]) => `${f}x${n}`).join(','));
}
