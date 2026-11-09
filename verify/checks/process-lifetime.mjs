import fs from 'node:fs';
import path from 'node:path';

const ENTRYPOINT = /^skills\/[^/]+\/scripts\/[^/]+\.mjs$/;
const IS_MAIN = /process\.argv\[1\]|\bisMain\(/;
const LONG_RUNNING = /\bfetch(?:Impl)?\(|\bsetInterval\(|\bdelay\(|\bexecFile\(\s*(?!['"](?:git|gh)['"])/;
const GUARDED = /\b(?:limitLifetime|exitWithParent)\(/;
const RELATIVE_IMPORT = /(?:from|import)\s*\(?\s*'(\.[^']+\.mjs)'/g;

const SELF_BOUNDED = new Map([
  ['run-session.mjs', 'ends its child tree on its own deadline and when its parent dies'],
  ['notify.mjs', 'one best-effort post with its own abort timeout'],
]);

function reachableText(file, root, seen = new Set()) {
  if (seen.has(file) || SELF_BOUNDED.has(path.basename(file)) || !file.startsWith(root) || !fs.existsSync(file)) return '';
  seen.add(file);
  const text = fs.readFileSync(file, 'utf8');
  const imported = [...text.matchAll(RELATIVE_IMPORT)].map((match) => path.resolve(path.dirname(file), match[1]));
  return [text, ...imported.map((next) => reachableText(next, root, seen))].join('\n');
}

export function checkProcessLifetime(report, repository) {
  const entrypoints = repository.trackedFiles()
    .filter((file) => ENTRYPOINT.test(repository.relative(file)) && IS_MAIN.test(repository.text(file)));
  const unguarded = entrypoints
    .filter((file) => LONG_RUNNING.test(reachableText(file, path.dirname(file) + path.sep)) && !GUARDED.test(repository.text(file)))
    .map((file) => repository.relative(file));
  report.assert(
    unguarded.length === 0,
    'process lifetime',
    `${entrypoints.length} skill script entrypoints that fetch, spawn a non-git child or poll call limitLifetime or exitWithParent`,
    `${unguarded.join(', ')} fetch, spawn a non-git child or poll without limitLifetime or exitWithParent from #lifetime`
  );
}
