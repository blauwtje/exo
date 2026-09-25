// One design-ui loop checkpoint: capture, audit and inspect a stage in one
// call, so a caller never assembles the four scripts' flags by hand and never
// sees their JSON on its own stdout.
//
//   node scripts/checkpoint.mjs --run <dir> --stage baseline|post-build|final
//                                --url <file:// or http:// url> [--source <dir>]

import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseFlags, requireUrl, UsageError } from './capture.mjs';

const STAGES = ['baseline', 'post-build', 'final'];
const VIEWPORTS = ['390x844', '1440x900'];
const SUMMARY_BLOCK_LIMIT = 5;
const DELTA_FIELDS = ['chromaStd', 'effectiveHueCount'];
const SCRIPTS_DIRECTORY = fileURLToPath(new URL('.', import.meta.url));

function scriptPath(name) {
  return path.join(SCRIPTS_DIRECTORY, name);
}

async function pathExists(file) {
  return fs.access(file).then(() => true, () => false);
}

async function readJson(file) {
  const text = await fs.readFile(file, 'utf8').catch(() => null);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Runs `node <script> <args>`; a failing child is reported by its exit code, never thrown. */
function runStep(name, args) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [scriptPath(name), ...args],
      { maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => resolve({
        code: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
        stdout: String(stdout),
        stderr: String(stderr)
      })
    );
  });
}

/** Every finding the check-ui report carries, in the order check-ui itself flattens them. */
function allFindings(checkUi) {
  const findings = [...(checkUi?.static?.findings ?? []), ...(checkUi?.rendered?.fixed?.findings ?? [])];
  for (const entry of Object.values(checkUi?.rendered?.viewports ?? {})) findings.push(...(entry?.findings ?? []));
  return findings;
}

function findingLabel(checkUi, entry) {
  if (entry.viewport) return entry.viewport;
  return (checkUi?.rendered?.fixed?.findings ?? []).includes(entry) ? 'fixed' : 'static';
}

function blockingFindings(checkUi) {
  const findings = allFindings(checkUi);
  const comparison = checkUi?.comparison ?? null;
  return comparison ? comparison.blocking : findings.filter((entry) => entry.confidence === 'definite');
}

/**
 * The design critic's input contract for one stage: renders, the check-ui
 * comparison, clipped/overlap findings and the render-delta and style
 * inspections, with nothing else from the run directory. Pure: every value
 * comes from its arguments, none from the filesystem.
 */
export function criticEvidence({ stage, contract, checkUi, renders, baselineRenders, renderDelta, styles, failed }) {
  const findings = allFindings(checkUi);
  return {
    stage,
    contract: contract ?? null,
    renders,
    baselineRenders: baselineRenders ?? null,
    counts: checkUi?.comparison?.counts ?? null,
    blocking: blockingFindings(checkUi),
    clipped: findings.filter((entry) => entry.type === 'content-clipped'),
    overlap: findings.filter((entry) => entry.type === 'element-overlap'),
    renderDelta,
    styles: styles ?? null,
    notes: checkUi?.notes ?? {},
    failed
  };
}

function deltaLabel(delta) {
  if (!delta) return 'none';
  return DELTA_FIELDS.map((field) => delta[field] ?? '').join(',');
}

/** At most 3 summary lines then at most 5 BLOCK lines, in place of any step's JSON. */
export function summaryLines({ stage, renders, checkUi, renderDelta, files, failed }) {
  const blocking = blockingFindings(checkUi);
  const label = (entry) => findingLabel(checkUi, entry);
  const blocking390 = blocking.filter((entry) => label(entry) === '390x844').length;
  const blocking1440 = blocking.filter((entry) => label(entry) === '1440x900').length;
  const blockingStatic = blocking.length - blocking390 - blocking1440;
  const counts = checkUi?.comparison?.counts ?? { new: 0, predating: 0, ignored: 0 };
  const header = [
    `stage=${stage}`, `renders=${Object.keys(renders ?? {}).length}`,
    `blocking390=${blocking390}`, `blocking1440=${blocking1440}`, `blockingStatic=${blockingStatic}`,
    `new=${counts.new}`, `predating=${counts.predating}`, `ignored=${counts.ignored}`
  ];
  if (failed?.length) header.push(`failed=${failed.join(',')}`);
  const lines = [
    header.join(' '),
    `delta390=${deltaLabel(renderDelta?.['390x844'])} delta1440=${deltaLabel(renderDelta?.['1440x900'])}`,
    `files: ${(files ?? []).join(' ')}`
  ];
  for (const entry of blocking.slice(0, SUMMARY_BLOCK_LIMIT)) {
    lines.push(`BLOCK ${label(entry)} ${entry.type} ${entry.selector}`);
  }
  return lines;
}

function parseStage(text) {
  if (!STAGES.includes(text)) throw new UsageError(`--stage must be one of ${STAGES.join(', ')}, received '${text}'`);
  return text;
}

async function checkpoint({ run, stage, url, source }) {
  await fs.mkdir(run, { recursive: true });
  const renderDirectory = path.join(run, 'renders');
  const baselineCheckUiFile = path.join(run, 'check-ui-baseline.json');
  const useBaselineCheckUi = stage !== 'baseline' && await pathExists(baselineCheckUiFile);
  const failed = [];
  const files = [];

  const captureArgs = ['--full-page', '--label', stage, '--out', renderDirectory];
  for (const viewport of VIEWPORTS) captureArgs.push('--viewport', viewport);
  captureArgs.push('--url', url);
  const captureResult = await runStep('capture.mjs', captureArgs);
  if (captureResult.code !== 0) failed.push('capture');

  const renders = {};
  const baselineRenders = {};
  let hasBaselineRenders = false;
  for (const viewport of VIEWPORTS) {
    const renderFile = path.join(renderDirectory, `${stage}-${viewport}-fullpage.png`);
    renders[viewport] = renderFile;
    if (captureResult.code === 0) files.push(renderFile);
    const baselineRenderFile = path.join(renderDirectory, `baseline-${viewport}-fullpage.png`);
    const hasBaselineRender = stage !== 'baseline' && await pathExists(baselineRenderFile);
    baselineRenders[viewport] = hasBaselineRender ? baselineRenderFile : null;
    hasBaselineRenders = hasBaselineRenders || hasBaselineRender;
  }

  const checkUiFile = path.join(run, `check-ui-${stage}.json`);
  const checkUiArgs = ['--url', url];
  if (source) checkUiArgs.push('--source', source);
  for (const viewport of VIEWPORTS) checkUiArgs.push('--viewport', viewport);
  if (useBaselineCheckUi) checkUiArgs.push('--baseline', baselineCheckUiFile);
  const checkUiResult = await runStep('check-ui.mjs', checkUiArgs);
  if (checkUiResult.code !== 0) {
    failed.push('check-ui');
  } else {
    await fs.writeFile(checkUiFile, checkUiResult.stdout);
    files.push(checkUiFile);
  }

  const renderDelta = {};
  for (const viewport of VIEWPORTS) {
    const width = viewport.split('x')[0];
    const inspectArgs = ['--image', renders[viewport]];
    if (baselineRenders[viewport]) inspectArgs.push('--baseline', baselineRenders[viewport]);
    const outFile = path.join(run, `inspect-render-${stage}-${width}.json`);
    const result = await runStep('inspect-render.mjs', inspectArgs);
    if (result.code !== 0) {
      failed.push('inspect-render');
      renderDelta[viewport] = null;
      continue;
    }
    await fs.writeFile(outFile, result.stdout);
    files.push(outFile);
    const report = await readJson(outFile);
    renderDelta[viewport] = report?.baselineDelta?.[0] ?? null;
  }

  const stylesFile = path.join(run, `inspect-styles-${stage}.json`);
  const stylesArgs = ['--url', url, '--viewport', '1440x900'];
  const stylesResult = await runStep('inspect-styles.mjs', stylesArgs);
  if (stylesResult.code !== 0) {
    failed.push('inspect-styles');
  } else {
    await fs.writeFile(stylesFile, stylesResult.stdout);
    files.push(stylesFile);
  }

  const checkUi = await readJson(checkUiFile);
  const styles = await readJson(stylesFile);
  const contractFile = path.join(run, 'contract-selected.json');
  const contract = await pathExists(contractFile) ? contractFile : null;

  let evidence = null;
  if (stage === 'post-build' || stage === 'final') {
    evidence = criticEvidence({
      stage, contract, checkUi, renders,
      baselineRenders: hasBaselineRenders ? baselineRenders : null,
      renderDelta, styles, failed
    });
    const evidenceFile = path.join(run, 'critic-evidence.json');
    await fs.writeFile(evidenceFile, `${JSON.stringify(evidence)}\n`);
    files.push(evidenceFile);
  }

  return { stage, renders, checkUi, renderDelta, files, failed };
}

async function main(argv) {
  const flags = parseFlags(argv, { run: 'value', stage: 'value', url: 'value', source: 'value' });
  if (!flags.run) throw new UsageError('--run is required');
  const stage = parseStage(flags.stage);
  const url = requireUrl(flags.url);

  const result = await checkpoint({ run: flags.run, stage, url, source: flags.source });
  for (const line of summaryLines(result)) process.stdout.write(`${line}\n`);
  if (result.failed.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    if (error instanceof UsageError) {
      process.stderr.write(`ui-design: ${error.message}\n`);
      process.exitCode = 2;
      return;
    }
    process.stderr.write(`ui-design: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
