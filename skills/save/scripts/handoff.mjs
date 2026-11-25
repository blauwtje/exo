import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { handoffFile } from '#handoff-file';
import { defaultBase } from '#plan-landed';
import { looksLikeRepoPath } from '#repo-path';
import { isMain, UsageError, USAGE_EXIT } from '#script-flags';

export { handoffFile };

const USAGE = 'usage: node handoff.mjs path|facts|stale [--cwd <dir>]\npath prints where the handoff of the current branch sits, inside the repository\'s git directory.\nfacts prints the Written line and the committed and uncommitted paths.\nstale prints the commits, changed paths and missing paths since the handoff was written.';
const RELATIVE_PATH = /^(?:[\w.-]+(?:\/[\w.-]+)+\/?|\w[\w-]*\.\w+)$/;

function gitOutput(cwd, args) {
  return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).stdout.trimEnd();
}

function lines(text) {
  return text === '' ? [] : text.split('\n');
}

function list(paths) {
  return paths.length === 0 ? 'none' : paths.join(', ');
}

function facts(cwd) {
  const base = defaultBase(cwd);
  const committed = base === null ? [] : lines(gitOutput(cwd, ['diff', '--name-only', `${base}...HEAD`]));
  const uncommitted = lines(gitOutput(cwd, ['status', '--short'])).map((line) => line.slice(3));
  const date = new Date().toISOString().slice(0, 10);
  return [
    `Written: ${date}, last commit ${gitOutput(cwd, ['rev-parse', '--short', 'HEAD'])}, branch ${gitOutput(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])}`,
    `Committed: ${list(committed)}`,
    `Uncommitted: ${list(uncommitted)}`
  ];
}

function stale(cwd) {
  const file = handoffFile(cwd);
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const written = /^Written: .*last commit ([0-9a-f]+)/m.exec(text);
  if (written === null) throw new Error(`no handoff with a Written line at ${file}`);
  const log = spawnSync('git', ['-C', cwd, 'log', `${written[1]}..HEAD`, '--oneline'], { encoding: 'utf8' });
  if (log.status !== 0) return [`Commits since: unknown, the handoff's commit ${written[1]} is not in this repository`];
  const commits = lines(log.stdout.trimEnd());
  const changed = lines(gitOutput(cwd, ['diff', '--name-only', `${written[1]}..HEAD`]));
  const top = gitOutput(cwd, ['rev-parse', '--show-toplevel']);
  const named = [...new Set([...text.matchAll(/`([^`\s]+)`/g)].map((match) => match[1]).filter((name) => RELATIVE_PATH.test(name) && looksLikeRepoPath(name, top)))];
  const missing = named.filter((name) => !fs.existsSync(path.join(top, name)));
  return [`Commits since: ${commits.length}`, ...commits, `Changed since: ${list(changed)}`, ...missing.map((name) => `Missing: ${name}`)];
}

function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { cwd: { type: 'string' }, help: { type: 'boolean' } }
  });
  const [command] = positionals;
  if (process.argv.includes('--help')) {
    console.log(USAGE);
    return;
  }
  const cwd = values.cwd ?? process.cwd();
  if (command === 'path') console.log(handoffFile(cwd));
  else if (command === 'facts') console.log(facts(cwd).join('\n'));
  else if (command === 'stale') {
    try {
      console.log(stale(cwd).join('\n'));
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  } else throw new UsageError(`unknown command ${command ?? '(none)'}; expected path, facts or stale`);
}

if (isMain(import.meta.url)) {
  try {
    main();
  } catch (error) {
    if (!(error instanceof UsageError) && !error.code?.startsWith('ERR_PARSE_ARGS')) throw error;
    console.error(error.message);
    process.exitCode = USAGE_EXIT;
  }
}
