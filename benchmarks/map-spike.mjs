// benchmarks/map-spike.mjs
// The numbers the repository-map spike reports: for each of two repositories,
// the size of its map with the cap lifted and at the default cap, the files
// named against the files counted at that cap, the share of JavaScript and
// TypeScript files whose exported names survive it, and the generator's run
// time; beside them, what the exo:explorer dispatches in this machine's session
// transcripts cost. It prints a markdown comment body that opens on the pass
// mark and says which marks the figures meet. A repository is known by its
// position on the command line and never by anything read from it: the first
// is labelled exo, the second is a private repository, every figure that leaves
// measureRepository is a number, and the one sentence a person adds, the verdict
// on the second repository's capped map, is refused when it holds a slash.
//
//   node benchmarks/map-spike.mjs <exo directory> <second directory> --verdict "<Yes|Partly|No>: <one sentence>"

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { configDirectory } from '#config-directory';
import { DEFAULT_CAP, renderMap } from '../skills/planning/scripts/map-render.mjs';
import { SCRIPT_EXTENSIONS, locateRepository, readTrackedFiles } from '../skills/planning/scripts/map-source.mjs';
import { countsCost } from '../skills/savings/scripts/pricing.mjs';
import { emptySession } from '../skills/savings/scripts/record.mjs';
import { sumCounts } from '../skills/savings/scripts/token-weights.mjs';
import { ingestTranscript, sumTokens } from '../skills/savings/scripts/transcript.mjs';
import { meanAndSd } from './statistics.mjs';

export const SPIKE_MARKER = '<!-- exo:map-spike -->';

const USAGE = 'usage: map-spike.mjs <exo directory> <second directory> --verdict "<Yes|Partly|No>: <one sentence>"';
const LABELS = ['exo', 'second repository (private)'];
const EXPLORER_AGENT = 'exo:explorer';

// The pass mark. It is committed before the measurement is taken, so the
// figures cannot move it: stage two is built only when every mark holds.
export const PASS_MARK = {
  exoNamedShare: 0.5,
  secondRepositoryNamedFiles: 20,
  secondRepositoryMilliseconds: 2000,
  // An absolute count, never derived from the map's cap: a raised cap would
  // otherwise move the mark after the measurement it was fixed for.
  dispatchTokens: 10000
};

// One line that opens on its answer and holds no slash, so the sentence written
// after reading the second repository's map cannot carry a path out of it.
const VERDICT = /^(Yes|Partly|No): [^\r\n/]{1,300}$/;

// Every value returned is a number, so no path and no name of the measured
// repository can travel into the report. The run time covers what one call of
// the generator does: list the tracked files, read their names, lay the map out.
export function measureRepository(directory) {
  const repository = locateRepository(directory);
  if (repository === null || repository.commit === null) {
    throw new Error('a measured directory must sit in a git repository that has a commit');
  }
  const started = performance.now();
  const files = readTrackedFiles(repository.top);
  const capped = renderMap({ commit: repository.commit, cap: DEFAULT_CAP, files });
  const milliseconds = Math.round(performance.now() - started);
  const uncapped = renderMap({ commit: repository.commit, cap: 0, files });
  const namedAtCap = new Set(capped.namedPaths);
  const withNames = files.filter((file) => file.names.length > 0 && SCRIPT_EXTENSIONS.has(path.extname(file.path)));
  const withNamesKept = withNames.filter((file) => namedAtCap.has(file.path));
  return {
    trackedFiles: files.length,
    uncappedBytes: Buffer.byteLength(uncapped.text),
    cappedBytes: Buffer.byteLength(capped.text),
    namedFiles: capped.namedPaths.length,
    countedFiles: files.length - capped.namedPaths.length,
    scriptFilesWithNames: withNames.length,
    scriptFilesWithNamesKept: withNamesKept.length,
    milliseconds
  };
}

function subdirectories(directory) {
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(directory, entry.name));
}

// The harness keeps a delegate at <project>/<session>/subagents/agent-<id>.jsonl
// and names its agent type in the agent-<id>.meta.json beside it.
function metaFiles(projectsDirectory) {
  const found = [];
  for (const project of subdirectories(projectsDirectory)) {
    for (const session of subdirectories(project)) {
      const delegates = path.join(session, 'subagents');
      if (!fs.existsSync(delegates)) continue;
      for (const name of fs.readdirSync(delegates).sort()) {
        if (name.endsWith('.meta.json')) found.push(path.join(delegates, name));
      }
    }
  }
  return found;
}

function agentType(metaFile) {
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    return meta.agentType;
  } catch {
    return undefined;
  }
}

function dispatchFigures(session) {
  const calls = Object.values(session.usageById);
  let cost = 0;
  for (const call of calls) {
    const callCost = countsCost(call, call.model);
    // An unlisted model has no price, and a dispatch holding one such call has none either.
    cost = cost === null || callCost === null ? null : cost + callCost;
  }
  const callTotals = calls.map((call) => sumCounts([call]).raw);
  return { tokens: sumTokens(session).raw, largestCall: Math.max(0, ...callTotals), calls: calls.length, cost };
}

// One entry per exo:explorer dispatch under the harness's projects folder.
export function explorerDispatches(projectsDirectory) {
  const dispatches = [];
  for (const metaFile of metaFiles(projectsDirectory)) {
    if (agentType(metaFile) !== EXPLORER_AGENT) continue;
    const session = emptySession();
    const transcript = metaFile.replace(/\.meta\.json$/, '.jsonl');
    if (!ingestTranscript(session, transcript)) continue;
    dispatches.push(dispatchFigures(session));
  }
  return dispatches;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function wholeNumber(value) {
  return String(Math.round(value));
}

function usd(value) {
  return `$${value.toFixed(4)}`;
}

function share(part, whole) {
  return whole === 0 ? String(part) : `${part} (${Math.round((part / whole) * 100)}%)`;
}

function figureRow(title, values) {
  return `| ${title} | ${values.join(' | ')} |`;
}

function statisticRow(title, values, format) {
  if (values.length === 0) return `| ${title} | none | none |`;
  return `| ${title} | ${format(median(values))} | ${format(meanAndSd(values).mean)} |`;
}

// One row per mark: what was measured against it and whether it holds.
export function passMarks({ measurements, dispatches, verdict }) {
  const [exo, second] = measurements;
  const namedShare = exo.scriptFilesWithNames === 0 ? 0 : exo.scriptFilesWithNamesKept / exo.scriptFilesWithNames;
  const medianTokens = dispatches.length === 0 ? null : median(dispatches.map((dispatch) => dispatch.tokens));
  return [
    {
      mark: `At least ${PASS_MARK.exoNamedShare * 100}% of the files with exported names in exo are still named at the cap`,
      measured: `${Math.round(namedShare * 100)}%`,
      holds: namedShare >= PASS_MARK.exoNamedShare
    },
    {
      mark: `The capped map of the second repository names at least ${PASS_MARK.secondRepositoryNamedFiles} files`,
      measured: String(second.namedFiles),
      holds: second.namedFiles >= PASS_MARK.secondRepositoryNamedFiles
    },
    {
      mark: `The generator takes at most ${PASS_MARK.secondRepositoryMilliseconds} ms on the second repository`,
      measured: `${second.milliseconds} ms`,
      holds: second.milliseconds <= PASS_MARK.secondRepositoryMilliseconds
    },
    {
      mark: `The median explorer dispatch bills at least ${PASS_MARK.dispatchTokens} tokens`,
      measured: medianTokens === null ? 'none' : wholeNumber(medianTokens),
      holds: medianTokens !== null && medianTokens >= PASS_MARK.dispatchTokens
    },
    {
      mark: 'Whoever read the capped map of the second repository answers Yes: it shows which folder to open for a file',
      measured: verdict.slice(0, verdict.indexOf(':')),
      holds: verdict.startsWith('Yes:')
    }
  ];
}

function passMarkLines(marks, verdict) {
  const failed = marks.filter((row) => !row.holds).length;
  const outcome = failed === 0
    ? 'every mark holds, so stage two is worth building'
    : `${failed} of ${marks.length} marks fail, so these figures do not carry stage two`;
  return [
    '| Pass mark, fixed before the measurement | Measured | Holds |',
    '|---|---:|---|',
    ...marks.map((row) => `| ${row.mark} | ${row.measured} | ${row.holds ? 'yes' : 'no'} |`),
    '',
    `Outcome: ${outcome}.`,
    '',
    `Verdict on the capped map of the second repository, from reading it: ${verdict}`,
    ''
  ];
}

// The comment body. It holds no slash, so a check for one proves no path rode
// along, and it opens on a marker a second run can look for before posting.
export function spikeReport({ commit, measurements, dispatches, verdict }) {
  if (!VERDICT.test(verdict ?? '')) {
    throw new Error('the verdict is one line that opens on Yes:, Partly: or No:, runs to 300 characters at most and holds no slash');
  }
  const marks = passMarks({ measurements, dispatches, verdict });
  const column = (figure) => measurements.map((measured) => measured[figure]);
  const kept = measurements.map((measured) => share(measured.scriptFilesWithNamesKept, measured.scriptFilesWithNames));
  const priced = dispatches.filter((dispatch) => dispatch.cost !== null);
  const costs = priced.map((dispatch) => dispatch.cost);
  const totalCost = costs.reduce((sum, cost) => sum + cost, 0);
  const lines = [
    SPIKE_MARKER,
    '## Repository map spike',
    '',
    `Measured at exo commit ${commit.slice(0, 7)} with the default cap of ${DEFAULT_CAP} bytes. The second repository is private, so it appears as sizes and counts only.`,
    '',
    ...passMarkLines(marks, verdict),
    figureRow('Figure', LABELS),
    `|---|${LABELS.map(() => '---:').join('|')}|`,
    figureRow('Tracked files', column('trackedFiles')),
    figureRow('Map with the cap lifted, bytes', column('uncappedBytes')),
    figureRow('Map at the cap, bytes', column('cappedBytes')),
    figureRow('Files named at the cap', column('namedFiles')),
    figureRow('Files counted behind collapsed lines', column('countedFiles')),
    figureRow('JavaScript and TypeScript files with exported names', column('scriptFilesWithNames')),
    figureRow('Of those, still named at the cap', kept),
    figureRow('Generator run time, ms', column('milliseconds')),
    '',
    `Explorer dispatches found in this machine's session transcripts: ${dispatches.length}, of which ${priced.length} priced at API list prices.`,
    '',
    '| Per dispatch | Median | Mean |',
    '|---|---:|---:|',
    statisticRow('Tokens billed over all calls', dispatches.map((dispatch) => dispatch.tokens), wholeNumber),
    statisticRow('Tokens in the largest single call', dispatches.map((dispatch) => dispatch.largestCall), wholeNumber),
    statisticRow('API calls', dispatches.map((dispatch) => dispatch.calls), wholeNumber),
    statisticRow('Cost, USD', costs, usd),
    '',
    `Total cost of the priced dispatches: ${usd(totalCost)}.`,
    '',
    'The billed total counts the cached context again on every call; the largest single call is the context a dispatch ended with.'
  ];
  return `${lines.join('\n')}\n`;
}

function usageFault(message) {
  console.error(`${message}\n${USAGE}`);
  process.exit(1);
}

function main(args) {
  let parsed;
  try {
    parsed = parseArgs({ args, options: { verdict: { type: 'string' } }, allowPositionals: true });
  } catch (error) {
    usageFault(error.message);
  }
  const directories = parsed.positionals;
  if (directories.length !== LABELS.length) usageFault(`${LABELS.length} directories are measured, ${directories.length} given`);
  if (!VERDICT.test(parsed.values.verdict ?? '')) usageFault('--verdict is one line that opens on Yes:, Partly: or No: and holds no slash');
  const measurements = directories.map((directory) => measureRepository(directory));
  const exo = locateRepository(directories[0]);
  const dispatches = explorerDispatches(path.join(configDirectory(), 'projects'));
  process.stdout.write(spikeReport({ commit: exo.commit, measurements, dispatches, verdict: parsed.values.verdict }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2));
}
