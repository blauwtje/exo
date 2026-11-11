import { execFileSync } from 'node:child_process';

const HUNK = /^@@ -\S+ \+(\d+)(?:,(\d+))? @@/;

export function fixDiffRanges(root, preFixSha) {
  const diff = execFileSync('git', ['-C', root, '-c', 'core.quotepath=off', 'diff', '-U0', '--no-color', `${preFixSha}..HEAD`], { encoding: 'utf8' });
  const ranges = new Map();
  let file = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) file = line.slice('+++ b/'.length);
    const hunk = HUNK.exec(line);
    if (file === null || hunk === null) continue;
    const start = Number(hunk[1]);
    const length = hunk[2] === undefined ? 1 : Number(hunk[2]);
    ranges.set(file, [...(ranges.get(file) ?? []), [start, start + Math.max(length, 1) - 1]]);
  }
  return ranges;
}

export function insideFixDiff(ranges, { path: file, range }) {
  const [from, to = from] = String(range).split('-').map(Number);
  return (ranges.get(file) ?? []).some(([start, end]) => from <= end && to >= start);
}
