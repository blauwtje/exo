import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CODE_EXTENSIONS, commentFindings } from '#code-comments';
import { findTranscript } from './cell-usage.mjs';

const DENY_MARKER = 'exo comment-guard:';

function git(repository, args) {
  return execFileSync('git', args, { cwd: repository, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}

function hasRef(repository, ref) {
  try {
    git(repository, ['rev-parse', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

function hunkLines(diff) {
  const added = [];
  for (const match of diff.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    for (let line = start; line < start + count; line++) added.push(line);
  }
  return added;
}

function fileComments(repository, range, file) {
  const diff = git(repository, ['diff', '--unified=0', '--no-color', '--no-ext-diff', range[0], range[1], '--', file]);
  const text = git(repository, ['show', `${range[1]}:${file}`]);
  return commentFindings(file, hunkLines(diff), text).length;
}

export function countCommentLines(repository, branch) {
  const base = git(repository, ['rev-list', '--max-parents=0', 'HEAD']).trim().split('\n')[0];
  const head = hasRef(repository, branch) ? branch : 'HEAD';
  const names = git(repository, ['diff', '--name-only', '--diff-filter=AM', base, head]).split('\n');
  const files = names.filter((name) => name && CODE_EXTENSIONS[path.extname(name).toLowerCase()]);
  return files.reduce((total, file) => total + fileComments(repository, [base, head], file), 0);
}

function transcriptFiles(transcript) {
  const files = [transcript];
  const directory = path.join(transcript.replace(/\.jsonl$/, ''), 'subagents');
  if (!fs.existsSync(directory)) return files;
  for (const name of fs.readdirSync(directory).sort()) {
    if (name.endsWith('.jsonl')) files.push(path.join(directory, name));
  }
  return files;
}

export function ledgerTranscripts(ledgerFile) {
  if (ledgerFile === null || !fs.existsSync(ledgerFile)) return [];
  const lines = fs.readFileSync(ledgerFile, 'utf8').split('\n').filter((line) => line.trim() !== '');
  const ids = lines.flatMap((line) => {
    try {
      return [JSON.parse(line).sessionId];
    } catch {
      return [];
    }
  });
  return ids.filter((id) => typeof id === 'string').map(findTranscript).filter(Boolean);
}

export function countHookDenials(transcripts) {
  let denials = 0;
  for (const transcript of transcripts.flatMap(transcriptFiles)) {
    if (fs.existsSync(transcript)) denials += fs.readFileSync(transcript, 'utf8').split(DENY_MARKER).length - 1;
  }
  return denials;
}

export function commentStats({ repository, branch, transcripts, hiddenPass }) {
  return {
    commentLines: countCommentLines(repository, branch),
    hookDenials: countHookDenials(transcripts),
    hiddenPass
  };
}
