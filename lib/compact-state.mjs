import fs from 'node:fs';
import path from 'node:path';
import { scratchPath } from '#scratch-path';
import { handoffFile } from '#handoff-file';
import { SPECS_FOLDER, SPECS_SCRATCH, SPEC_NOTES_SUFFIX } from '#shared-values';

function newest(folder, suffix) {
  if (!fs.existsSync(folder)) return undefined;
  const files = fs.readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => path.join(folder, entry.name));
  return files.map((file) => ({ file, time: fs.statSync(file).mtimeMs })).sort((a, b) => b.time - a.time)[0]?.file;
}

export function compactStateLine(project) {
  const found = [
    ['plan', newest(path.join(project, SPECS_FOLDER), '.md')],
    ['notes file', newest(scratchPath(project, SPECS_SCRATCH), SPEC_NOTES_SUFFIX)],
    ['handoff', [handoffFile(project)].find((file) => fs.existsSync(file))]
  ].filter(([, file]) => file !== undefined);
  if (found.length === 0) return '';
  return `After the compaction, read these again: ${found.map(([label, file]) => `${label} ${file}`).join('; ')}.`;
}
