import fs from 'node:fs';
import path from 'node:path';
import { exportSignatures } from '#export-signatures';
import { SCRIPT_EXTENSIONS } from '#script-extensions';
import { gitLine } from '#git';
import { CHILD_OUTPUT_LIMIT } from '#process-tree';

const STAGES_ALL = /^(?:\.|\.\/|-A|--all|:\/|.*[*?[].*)$/;

export function addedPathspecs(commitBlock) {
  const specs = [...commitBlock.matchAll(/\bgit\s+add\b([^;&|\n]*)/g)]
    .flatMap((match) => match[1].trim().split(/\s+/))
    .map((arg) => arg.replace(/^['"]|['"]$/g, ''))
    .filter((arg) => arg !== '' && arg !== '--' && !/^-(?!A$|-all$)/.test(arg));
  if (specs.some((spec) => STAGES_ALL.test(spec))) return null;
  return specs.flatMap((spec) => [spec, `${spec.replace(/\/$/, '')}/`]);
}

function breaksCallers(before, after) {
  return after.required > before.required || after.total < before.total || (before.hasRest && !after.hasRest);
}

function signatureChangesOf(root, file) {
  const before = gitLine(root, ['show', `HEAD:${file}`], { trim: false, maxBuffer: CHILD_OUTPUT_LIMIT });
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
