import { git, gitLine, gitText } from './git.mjs';
import { commitsOf, defaultBase } from './plan-landed.mjs';

const NUL_LIST = (text) => text.split('\0').filter(Boolean);

export function repoState(root) {
  let reads = new Map();
  const once = (key, read) => {
    if (!reads.has(key)) reads.set(key, read());
    return reads.get(key);
  };
  const byPaths = (name, paths, read) => once(`${name}\0${paths.join('\0')}`, () => read(paths));

  return {
    root,
    toplevel: () => once('toplevel', () => gitLine(root, ['rev-parse', '--show-toplevel'])),
    defaultBase: () => once('defaultBase', () => defaultBase(root)),
    planCommits: () => once('planCommits', () => commitsOf(root, once('defaultBase', () => defaultBase(root)))),
    stagedDeletions: () => once('stagedDeletions', () => new Set(NUL_LIST(gitText(root, ['diff', '--cached', '--name-only', '--no-renames', '--diff-filter=D', '-z'], { trim: false })))),
    trackedPaths: (paths) => byPaths('tracked', paths, () => (paths.length === 0 ? [] : NUL_LIST(gitText(root, ['ls-files', '-z', '--', ...paths], { trim: false })))),
    ignoredPaths: (paths) => byPaths('ignored', paths, () => {
      if (paths.length === 0) return new Set();
      const answer = git(root, ['check-ignore', '--stdin', '-z'], { input: paths.join('\0') });
      if (answer.status !== 0) return new Set();
      return new Set(NUL_LIST(answer.stdout));
    }),
    head: () => once('head', () => {
      const [sha, ...message] = gitText(root, ['log', '-1', '--format=%H%x1f%B'], { trim: false }).split('\x1f');
      return { sha, message: message.join('\x1f').trim() };
    }),
    invalidate: () => {
      reads = new Map();
    },
  };
}
