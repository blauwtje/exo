#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { runInWorktree } from '#red-green';
import { scratchPath } from '#scratch-path';
import { environmentMs, isMain, parseFlags, UsageError } from '#script-flags';
import { runGuarded, stallSeconds, STALL_EXIT } from '#stall-guard';

const SCRIPT = fileURLToPath(import.meta.url);
const PROBE_DEFAULT_MS = 600_000;
const MAX_LINES = 30;
const SKIP_EXIT = 125;
const PROOF_SEPARATOR = /^`?(?: → | -> |: pass)/;
const FIRST_BAD = /^([0-9a-f]{40}) is the first bad commit/m;

const USAGE = `Usage: node bisect.mjs --repro <command> [--good <ref>]
Runs <command> in a temporary worktree at HEAD, picks the newest good commit that command passes at, and bisects history to the commit that first breaks it.
Good ref: --good; else the newest ancestor whose body holds a Proof: line naming <command>; else the merge-base with origin/HEAD; else HEAD~1, ~2, ~4, ~8, ... doubling back to the root commit, the first where the command passes twice.
Prints First bad, Good, Diff, Log and the changed files, up to 30 lines; the full diff and every run's output land in .exo/debug/.
A repro that passes at HEAD, alternates, or cannot be bisected prints one Bisect: line and exits 1; a usage error exits 2.
`;

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function commitSha(root, ref) {
  try {
    return git(root, 'rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`).trim();
  } catch {
    return null;
  }
}

function isAncestorOfHead(root, sha) {
  try {
    git(root, 'merge-base', '--is-ancestor', sha, 'HEAD');
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw error;
  }
}

function checkoutRoot() {
  return git(process.cwd(), 'rev-parse', '--show-toplevel').trim();
}

function checkedGood(root, flag) {
  if (flag.startsWith('-')) throw new UsageError(`--good must not start with '-': ${flag}`);
  const sha = commitSha(root, flag);
  if (sha === null) throw new UsageError(`--good does not name a commit: ${flag}`);
  if (!isAncestorOfHead(root, sha)) throw new UsageError(`--good is not an ancestor of HEAD: ${flag}`);
  return sha;
}

function namesCommand(body, command) {
  return body.split('\n').some((line) => {
    if (!line.startsWith('Proof:')) return false;
    const rest = line.slice('Proof:'.length).trimStart();
    const at = rest.indexOf(command);
    return at !== -1 && PROOF_SEPARATOR.test(rest.slice(at + command.length));
  });
}

function proofCommits(root, command) {
  try {
    const listed = git(root, 'log', '-F', `--grep=${command}`, '--format=%H', 'HEAD~1');
    return listed.split('\n').filter(Boolean).filter((sha) => namesCommand(git(root, 'log', '-1', '--format=%B', sha), command));
  } catch {
    return [];
  }
}

function remoteBase(root, headSha) {
  try {
    const sha = git(root, 'merge-base', 'HEAD', 'refs/remotes/origin/HEAD').trim();
    return sha === headSha ? null : sha;
  } catch {
    return null;
  }
}

function candidates(root, { flagSha, command, headSha }) {
  const found = [];
  const add = (sha, reason) => {
    if (sha === null || sha === headSha || found.some((candidate) => candidate.sha === sha)) return;
    found.push({ sha, reason });
  };
  if (flagSha !== null) add(flagSha, 'flag');
  for (const sha of proofCommits(root, command)) add(sha, 'proof trailer');
  add(remoteBase(root, headSha), 'merge-base');
  for (const { sha, reason } of ancestorCandidates(root)) add(sha, reason);
  return found;
}

function ancestorCandidates(root) {
  const found = [];
  for (let step = 1; ; step *= 2) {
    const sha = commitSha(root, `HEAD~${step}`);
    if (sha === null) break;
    found.push({ sha, reason: `HEAD~${step}` });
  }
  const rootSha = git(root, 'rev-list', '--max-parents=0', 'HEAD').trim().split('\n').at(-1);
  found.push({ sha: rootSha, reason: 'root commit' });
  return found;
}

const shellQuote = (text) => `'${String(text).replaceAll("'", "'\\''")}'`;

const probeCommand = (repro) => `node ${shellQuote(SCRIPT)} --probe ${shellQuote(repro)}`;

function runProbe(probe, base) {
  const result = runInWorktree({ root: probe.root, base, command: probe.command, timeoutMs: probe.timeoutMs });
  probe.log.push(result.output);
  return result;
}

function lastLine(text) {
  return text.trim().split('\n').filter(Boolean).at(-1) ?? 'no output';
}

function headOutcome(probe) {
  const runs = [runProbe(probe, 'HEAD'), runProbe(probe, 'HEAD')];
  const failed = runs.find((result) => result.status === 'error');
  if (failed !== undefined) return { reason: `error: ${lastLine(failed.output)}` };
  const passes = runs.filter((result) => result.status === 'green').length;
  if (passes === 2) return { reason: 'no failure at HEAD' };
  if (passes === 1) return { reason: 'flaky repro' };
  return { output: runs[1].output };
}

function goodCandidate(probe, list) {
  for (const candidate of list) {
    const first = runProbe(probe, candidate.sha);
    if (first.status === 'error') return { reason: `error: ${lastLine(first.output)}` };
    if (first.status === 'red') continue;
    const second = runProbe(probe, candidate.sha);
    if (second.status === 'error') return { reason: `error: ${lastLine(second.output)}` };
    if (second.status === 'red') return { reason: 'flaky repro' };
    return { good: candidate };
  }
  return { reason: `no passing commit in ${list.length} candidates` };
}

function bisectRange(probe, { headSha, goodSha }) {
  const count = Number(git(probe.root, 'rev-list', '--count', `${goodSha}..${headSha}`).trim());
  const cap = probe.timeoutMs * (Math.ceil(Math.log2(count)) + 2);
  const command = `git bisect start ${headSha} ${goodSha} && git bisect run ${probe.command}`;
  return runInWorktree({ root: probe.root, base: 'HEAD', command, timeoutMs: cap });
}

function confirmFirstBad(probe, firstBad) {
  const bad = runProbe(probe, firstBad);
  if (bad.status === 'error') return `error: ${lastLine(bad.output)}`;
  if (bad.status !== 'red') return 'flaky repro';
  const parent = commitSha(probe.root, `${firstBad}^`);
  if (parent === null) return null;
  const good = runProbe(probe, parent);
  if (good.status === 'error') return `error: ${lastLine(good.output)}`;
  return good.status === 'green' ? null : 'flaky repro';
}

function writeOutputs(probe, sha) {
  const name = `bisect-${sha.slice(0, 7)}`;
  const diff = scratchPath(probe.root, `debug/${name}.diff`);
  const trace = scratchPath(probe.root, `debug/${name}.log`);
  fs.writeFileSync(diff, git(probe.root, 'show', sha));
  fs.writeFileSync(trace, `${probe.log.join('\n')}\n`);
  return { diff, trace };
}

function fallback(probe, reason) {
  fs.writeFileSync(scratchPath(probe.root, 'debug/bisect-head.log'), `${probe.log.join('\n')}\n`);
  process.stdout.write(`Bisect: ${reason}\n`);
  process.exitCode = 1;
}

function hunkLines(root, sha, headOutput) {
  const changed = git(root, 'show', '--name-only', '--format=', sha).split('\n').filter(Boolean);
  const named = changed.filter((file) => headOutput.includes(file));
  if (named.length === 0) return [];
  return git(root, 'show', '--format=', sha, '--', ...named).split('\n').filter(Boolean);
}

function successLines(probe, { firstBad, good, paths, headOutput }) {
  const subject = git(probe.root, 'show', '-s', '--format=%s', firstBad).trim();
  const stat = git(probe.root, 'show', '--stat', '--format=', firstBad).split('\n').filter(Boolean);
  return [
    `First bad: ${firstBad} ${subject}`,
    `Good: ${good.sha} (${good.reason})`,
    `Diff: ${paths.diff}`,
    `Log: ${paths.trace}`,
    ...stat,
    ...hunkLines(probe.root, firstBad, headOutput)
  ].slice(0, MAX_LINES);
}

function bisect({ repro, good }) {
  const root = checkoutRoot();
  const probe = {
    root,
    command: probeCommand(repro),
    timeoutMs: environmentMs('EXO_BISECT_PROBE_MS', PROBE_DEFAULT_MS),
    log: []
  };
  const headSha = commitSha(root, 'HEAD');
  const flagSha = good === undefined ? null : checkedGood(root, good);

  const head = headOutcome(probe);
  if (head.reason !== undefined) return fallback(probe, head.reason);

  const list = candidates(root, { flagSha, command: repro, headSha });
  const chosen = goodCandidate(probe, list);
  if (chosen.reason !== undefined) return fallback(probe, chosen.reason);

  const walked = bisectRange(probe, { headSha, goodSha: chosen.good.sha });
  probe.log.push(walked.output);
  if (walked.status === 'error') return fallback(probe, `error: ${lastLine(walked.output)}`);
  if (walked.status === 'red') return fallback(probe, `unbisectable: ${lastLine(walked.output)}`);

  const named = FIRST_BAD.exec(walked.output);
  if (named === null) return fallback(probe, 'error: git bisect named no commit');

  const mismatch = confirmFirstBad(probe, named[1]);
  if (mismatch !== null) return fallback(probe, mismatch);

  const paths = writeOutputs(probe, named[1]);
  const lines = successLines(probe, { firstBad: named[1], good: chosen.good, paths, headOutput: head.output });
  process.stdout.write(`${lines.join('\n')}\n`);
}

function probeExit(code) {
  if (code === 0) return 0;
  if (code === STALL_EXIT || code >= SKIP_EXIT) return SKIP_EXIT;
  return 1;
}

async function main(argv) {
  const values = parseFlags(argv, { repro: 'string', good: 'string', probe: 'string' }, { usage: USAGE });
  if (values.probe !== undefined) return probeExit(await runGuarded({ command: values.probe, seconds: stallSeconds() }));
  if (values.repro === undefined) throw new UsageError('--repro is required');
  bisect(values);
  return null;
}

async function entry() {
  try {
    const code = await main(process.argv.slice(2));
    if (code !== null) process.exit(code);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`bisect: ${error.message}\n`);
    process.exitCode = 2;
  }
}

if (isMain(import.meta.url)) await entry();
