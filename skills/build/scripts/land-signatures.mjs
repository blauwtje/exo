import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { exportSignatures } from '#export-signatures';
import { SCRIPT_EXTENSIONS } from '#script-extensions';

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

function breaksCallers(before, after) {
  return after.required > before.required || after.total < before.total || (before.hasRest && !after.hasRest);
}

function signatureChangesOf(root, file) {
  const before = sourceAtHead(root, file);
  const workingPath = path.join(root, file);
  if (before === null || !fs.existsSync(workingPath)) return [];
  const after = exportSignatures(fs.readFileSync(workingPath, 'utf8'));
  const changes = [];
  for (const [name, oldParameters] of exportSignatures(before)) {
    const newParameters = after.get(name);
    if (newParameters === undefined || !breaksCallers(oldParameters, newParameters)) continue;
    changes.push(`${file}:${name}(${oldParameters.text}) -> (${newParameters.text})`.replace(/\s+/g, ' '));
  }
  return changes;
}

export function signatureChanges(task, root) {
  const files = new Set(task.files.map((file) => file.path));
  const scripts = [...files].filter((file) => !file.endsWith('/') && SCRIPT_EXTENSIONS.has(path.extname(file)));
  return scripts.flatMap((file) => signatureChangesOf(root, file));
}
