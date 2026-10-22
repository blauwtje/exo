import { spawnSync } from 'node:child_process';
import { NONE_VALUE, RESULT_VALUE, WORDING_PATH } from '../../lib/evidence-rules.mjs';

const BASE_REF = 'origin/main';
const NAME = 'edit evidence';

function git(root, args) {
  return spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function lines(run) {
  return run.stdout.split('\n').filter((line) => line !== '');
}

function badTrailer(value, results) {
  if (NONE_VALUE.test(value)) return '';
  if (!RESULT_VALUE.test(value)) return 'names neither a benchmarks/results or benchmarks/pressure file nor `none (<reason>)`; a command result goes in a `Proof: <command> → <result>` line';
  if (results === null) return '';
  return results.has(value) ? '' : 'names a file not added or changed in this range';
}

function changesSince(root) {
  const mergeBase = git(root, ['merge-base', 'HEAD', BASE_REF]);
  if (mergeBase.status !== 0) return { unrun: `the merge base with ${BASE_REF} is not available to compare against` };
  const base = mergeBase.stdout.trim();
  const changed = git(root, ['diff', '--name-only', base, 'HEAD']);
  const added = git(root, ['diff', '--name-only', '--diff-filter=AM', base, 'HEAD']);
  const log = git(root, ['log', `${base}..HEAD`, '--format=%h%x00%B%x1e']);
  if (changed.status !== 0 || added.status !== 0 || log.status !== 0) return { unrun: `git could not list the changes since ${BASE_REF}` };
  return { changed: lines(changed), added: new Set(lines(added)), log: log.stdout };
}

function evidenceProblems(log, results, needOne) {
  const problems = [];
  let found = 0;
  for (const entry of log.split('\x1e')) {
    const [sha, body = ''] = entry.replace(/^\n/, '').split('\0');
    for (const match of body.matchAll(/^Evidence:[ \t]*(.*)$/gm)) {
      found += 1;
      const value = match[1].trim();
      const why = badTrailer(value, results);
      if (why !== '') problems.push(`${sha} Evidence: ${value || '(empty)'} ${why}`);
    }
  }
  if (needOne && found === 0) problems.push('no commit since the merge base has an `Evidence:` trailer');
  return problems;
}

export function checkEditEvidence(report, repository) {
  const since = changesSince(repository.root);
  if (since.unrun !== undefined) {
    report.result('UNRUN', NAME, since.unrun);
    return;
  }
  const edited = since.changed.filter((file) => WORDING_PATH.test(file));
  const problems = evidenceProblems(since.log, edited.length > 0 ? since.added : null, edited.length > 0);
  if (edited.length === 0) {
    report.assert(problems.length === 0, NAME, 'no wording file changed and every Evidence trailer in the range is valid', `${problems.join('; ')}; fix the \`Evidence:\` line`);
    return;
  }
  report.assert(
    problems.length === 0,
    NAME,
    `${edited.length} wording file(s) changed and the range carries a valid Evidence trailer`,
    `${problems.join('; ')} (changed: ${edited.join(', ')}); add \`Evidence: benchmarks/results/<file>\` or \`Evidence: none (<reason>)\``
  );
}
