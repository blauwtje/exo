#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { confineRefusal } from '#confine-claude';
import { UsageError, isMain, parseFlags } from '#script-flags';
import { cellsFor } from './pressure-cells-for.mjs';
import { runOneCell } from './pressure-cell.mjs';
import { defaultJudge, linesForCase, parseCriteria, parseMargins } from './pressure-grade.mjs';
import { pressureHome } from './pressure-home.mjs';
import { SPEC, USAGE, optionsFrom } from './pressure-options.mjs';
import { dryRunReport, recordedRuns } from './pressure-records.mjs';
import { regradeFolder } from './pressure-regrade.mjs';
import { gradeReport } from './pressure-report.mjs';

function usageError(message) {
  console.error(message);
  process.exitCode = 2;
}

function parseOptions() {
  try {
    return optionsFrom(parseFlags(process.argv.slice(2), SPEC, { usage: USAGE }));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    usageError(`${USAGE}: ${error.message}`);
    return undefined;
  }
}

function printCells(spec) {
  try {
    console.log(cellsFor(spec));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    usageError(`${USAGE}: ${error.message}`);
  }
}

function printGrades(folder, gradesByCell, flags) {
  const margins = parseMargins(fs.readFileSync(flags.grade.criteriaFile, 'utf8'));
  console.log(gradeReport(folder, gradesByCell, { threshold: flags.grade.threshold, margins, mode: flags.mode }).join('\n'));
}

function regrade(flags) {
  const gradesByCell = regradeFolder(flags.regrade, { promptFile: flags.promptFile, grade: flags.grade, judge: defaultJudge(flags.grade.judgeCell) });
  printGrades(flags.regrade, gradesByCell, flags);
}

function dryRun(flags) {
  const judgeLines = flags.grade ? linesForCase(parseCriteria(fs.readFileSync(flags.grade.criteriaFile, 'utf8')), path.basename(flags.promptFile)).filter((line) => line.tag.kind === 'judge').length : 0;
  const recorded = flags.outDir === undefined ? [] : recordedRuns(path.resolve(flags.outDir));
  console.log(dryRunReport({ cells: flags.cells, runs: flags.runs, judgeLines, votes: flags.grade?.votes ?? 0 }, recorded));
}

function readPrompt(promptFile) {
  try {
    return fs.readFileSync(promptFile, 'utf8');
  } catch (error) {
    usageError(`usage: pressure.mjs: cannot read --prompt file '${promptFile}': ${error.message}`);
    return undefined;
  }
}

function makeOutDir(requested) {
  try {
    const outDir = requested === undefined
      ? fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-answers-'))
      : path.resolve(requested);
    fs.mkdirSync(outDir, { recursive: true });
    return outDir;
  } catch (error) {
    usageError(`usage: pressure.mjs: cannot create --out directory '${requested}': ${error.message}`);
    return undefined;
  }
}

async function runCells(flags, promptText, outDir) {
  console.log(`answers: ${outDir}`);
  const home = pressureHome();
  const gradesByCell = {};
  try {
    for (const cell of flags.cells) {
      await runOneCell(cell, promptText, { ...flags, outDir, home, gradesByCell });
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
  if (flags.grade) printGrades(outDir, gradesByCell, flags);
}

async function main() {
  const flags = parseOptions();
  if (flags === undefined) return;
  if (flags.cellsFor !== undefined) return printCells(flags.cellsFor);
  if (flags.regrade !== undefined) return regrade(flags);
  if (flags.dryRun) return dryRun(flags);
  const refusal = confineRefusal();
  if (refusal !== undefined) return usageError(`pressure.mjs: ${refusal}`);
  const promptText = readPrompt(flags.promptFile);
  if (promptText === undefined) return;
  const outDir = makeOutDir(flags.outDir);
  if (outDir === undefined) return;
  if (process.env.CLAUDE_CONFIG_DIR) return usageError('usage: pressure.mjs: CLAUDE_CONFIG_DIR is set, but the default-options mirror covers only ~/.claude; unset it');
  await runCells(flags, promptText, outDir);
}

if (isMain(import.meta.url)) {
  await main();
}
