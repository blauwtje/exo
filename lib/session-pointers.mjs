import fs from 'node:fs';
import path from 'node:path';
import { gitLine } from '#git';
import { environmentMs } from './script-flags.mjs';

function located(file, top) {
  const relative = top ? path.relative(top, file) : '';
  if (relative === '' || relative.startsWith('..')) return `\`${file}\``;
  return `\`${relative}\` from the repository root`;
}

export function newestProgressFile(cwd, notBefore = 1) {
  const folder = path.join(cwd, '.exo');
  if (!fs.existsSync(folder)) return undefined;
  const candidates = fs.readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(folder, entry.name, 'progress.md'))
    .map((file) => ({ file, modified: fs.statSync(file, { throwIfNoEntry: false })?.mtimeMs ?? 0 }))
    .filter((candidate) => candidate.modified >= notBefore);
  candidates.sort((first, second) => second.modified - first.modified);
  return candidates[0]?.file;
}

function progressPointer(cwd, source, top) {
  if (!['compact', 'clear', 'resume'].includes(source)) return '';
  const file = newestProgressFile(cwd, Date.now() - environmentMs('EXO_PROGRESS_POINTER_MS', 3600000));
  if (file === undefined) return '';
  return `A progress file sits at ${located(file, top)}. Read it only when this session continues that work.\n\n`;
}

function handoffFileFor(configDirectory, gitDirectory, scope) {
  if (gitDirectory === null) return path.join(configDirectory, 'handoff', `${scope}.md`);
  return path.join(gitDirectory, 'exo', 'handoff', `${scope}.md`);
}

function handoffPointer(configDirectory, cwd, gitDirectory, top) {
  const scope = gitDirectory === null ? path.basename(cwd) : gitLine(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']) ?? '';
  const handoffFile = handoffFileFor(configDirectory, gitDirectory, scope);
  if (!fs.existsSync(handoffFile) || !fs.statSync(handoffFile).isFile()) return '';
  const staleness = gitDirectory === null ? '' : ' Compare its `Written:` commit with `git rev-parse --short HEAD`.';
  const resumeLine = fs.readFileSync(handoffFile, 'utf8').split('\n').map((line) => line.trim()).filter((line) => line.startsWith('Resume: ')).pop();
  const resume = resumeLine === undefined ? '' : ` To continue it, the user sends: ${resumeLine.slice('Resume: '.length, 'Resume: '.length + 300)}`;
  return `A handoff for \`${scope}\` sits at ${located(handoffFile, top)}. Read it only when this session continues that work.${staleness}${resume}\n\n`;
}

export function pointersFor(configDirectory, cwd, source) {
  const gitDirectory = gitLine(cwd, ['rev-parse', '--absolute-git-dir']);
  const top = gitDirectory === null ? null : gitLine(cwd, ['rev-parse', '--show-toplevel']);
  return handoffPointer(configDirectory, cwd, gitDirectory, top) + progressPointer(cwd, source, top);
}
