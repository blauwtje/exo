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

async function main() {
  let flags;
  try {
    flags = optionsFrom(parseFlags(process.argv.slice(2), SPEC, { usage: USAGE }));
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(`${USAGE}: ${error.message}`);
    process.exitCode = 2;
    return;
  }
  if (flags.cellsFor !== undefined) {
    try {
      console.log(cellsFor(flags.cellsFor));
    } catch (error) {
      if (!(error instanceof UsageError)) throw error;
      console.error(`${USAGE}: ${error.message}`);
      process.exitCode = 2;
    }
    return;
  }
  if (flags.regrade !== undefined) {
    const gradesByCell = regradeFolder(flags.regrade, { promptFile: flags.promptFile, grade: flags.grade, judge: defaultJudge(flags.grade.judgeCell) });
    const margins = parseMargins(fs.readFileSync(flags.grade.criteriaFile, 'utf8'));
    console.log(gradeReport(flags.regrade, gradesByCell, { threshold: flags.grade.threshold, margins, mode: flags.mode }).join('\n'));
    return;
  }
  if (flags.dryRun) {
    const judgeLines = flags.grade ? linesForCase(parseCriteria(fs.readFileSync(flags.grade.criteriaFile, 'utf8')), path.basename(flags.promptFile)).filter((line) => line.tag.kind === 'judge').length : 0;
    const recorded = flags.outDir === undefined ? [] : recordedRuns(path.resolve(flags.outDir));
    console.log(dryRunReport({ cells: flags.cells, runs: flags.runs, judgeLines, votes: flags.grade?.votes ?? 0 }, recorded));
    return;
  }
  const refusal = confineRefusal();
  if (refusal !== undefined) {
    console.error(`pressure.mjs: ${refusal}`);
    process.exitCode = 2;
    return;
  }
  let promptText;
  try {
    promptText = fs.readFileSync(flags.promptFile, 'utf8');
  } catch (error) {
    console.error(`usage: pressure.mjs: cannot read --prompt file '${flags.promptFile}': ${error.message}`);
    process.exitCode = 2;
    return;
  }
  let outDir;
  try {
    outDir = flags.outDir === undefined
      ? fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-answers-'))
      : path.resolve(flags.outDir);
    fs.mkdirSync(outDir, { recursive: true });
  } catch (error) {
    console.error(`usage: pressure.mjs: cannot create --out directory '${flags.outDir}': ${error.message}`);
    process.exitCode = 2;
    return;
  }
  if (process.env.CLAUDE_CONFIG_DIR) {
    console.error('usage: pressure.mjs: CLAUDE_CONFIG_DIR is set, but the default-options mirror covers only ~/.claude; unset it');
    process.exitCode = 2;
    return;
  }
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
  if (flags.grade) {
    const margins = parseMargins(fs.readFileSync(flags.grade.criteriaFile, 'utf8'));
    console.log(gradeReport(outDir, gradesByCell, { threshold: flags.grade.threshold, margins, mode: flags.mode }).join('\n'));
  }
}

if (isMain(import.meta.url)) {
  await main();
}
