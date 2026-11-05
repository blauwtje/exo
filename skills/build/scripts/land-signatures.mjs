import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { exportSignatures } from '#export-signatures';
import { SCRIPT_EXTENSIONS } from '#script-extensions';
import { isCovered } from '#plan-landed';
import { LandingError, PlanDriftError } from './land-errors.mjs';

const STAGES_ALL = /^(?:\.|\.\/|-A|--all|:\/|.*[*?[].*)$/;

export function addedPathspecs(commitBlock) {
  const specs = [...commitBlock.matchAll(/\bgit\s+add\b([^;&|\n]*)/g)]
    .flatMap((match) => match[1].trim().split(/\s+/))
    .map((arg) => arg.replace(/^['"]|['"]$/g, ''))
    .filter((arg) => arg !== '' && arg !== '--' && !/^-(?!A$|-all$)/.test(arg));
  if (specs.some((spec) => STAGES_ALL.test(spec))) return null;
  return specs.flatMap((spec) => [spec, `${spec.replace(/\/$/, '')}/`]);
}

function sourceAtHead(root, file) {
  const shown = spawnSync('git', ['-C', root, 'show', `HEAD:${file}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return shown.status === 0 ? shown.stdout : null;
}

function outsideCallers(root, name, inFiles) {
  const pathspecs = [...SCRIPT_EXTENSIONS].map((extension) => `*${extension}`);
  const found = spawnSync('git', ['-C', root, 'grep', '-l', '-w', '-F', '-e', name, '--', ...pathspecs], { encoding: 'utf8' });
  // why: git grep exits 1 when nothing matches, so only a higher status is a failure.
  if (found.error !== undefined || found.status > 1) {
    throw new LandingError(`git grep for callers of ${name} failed: ${found.error?.message ?? found.stderr.trim()}`);
  }
  return found.stdout.split('\n').filter((file) => file !== '' && !isCovered([...inFiles], file));
}

function breaksCallers(before, after) {
  return after.required > before.required || after.total < before.total || (before.hasRest && !after.hasRest);
}

export function signatureChanges(task, root) {
  const inFiles = new Set(task.files.map((file) => file.path));
  const changes = [];
  const drifts = [];
  for (const file of inFiles) {
    if (file.endsWith('/') || !SCRIPT_EXTENSIONS.has(path.extname(file))) continue;
    const before = sourceAtHead(root, file);
    const workingPath = path.join(root, file);
    if (before === null || !fs.existsSync(workingPath)) continue;
    const after = exportSignatures(fs.readFileSync(workingPath, 'utf8'));
    for (const [name, oldParameters] of exportSignatures(before)) {
      const newParameters = after.get(name);
      if (newParameters === undefined || !breaksCallers(oldParameters, newParameters)) continue;
      const change = `${file}:${name}(${oldParameters.text}) -> (${newParameters.text})`.replace(/\s+/g, ' ');
      changes.push(change);
      const callers = outsideCallers(root, name, inFiles);
      if (callers.length > 0) drifts.push(`PLAN DRIFT: Task ${task.number}: ${change}; callers outside Files: ${callers.join(', ')}`);
    }
  }
  if (drifts.length > 0) throw new PlanDriftError(drifts.join('\n'));
  return changes;
}
