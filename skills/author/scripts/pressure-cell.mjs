import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { confinedClaude } from '#confine-claude';
import { comparisonArm, wrongCopies } from '#plugin-copy';
import { answerText, fileSafe } from './pressure-answers.mjs';
import { contrastArms } from './pressure-contrast.mjs';
import { defaultJudge, gradeRun, linesForCase, parseCriteria } from './pressure-grade.mjs';
import { withHome } from './pressure-home.mjs';
import { recordRun } from './pressure-records.mjs';
import { claudeArguments, runArm, runInSequence, runCaseSetup } from './pressure-run.mjs';
import { makeRunFolder } from './pressure-run-folder.mjs';

function cellArms({ pluginDir, pluginId, mainDir, contrast }) {
  if (contrast !== undefined) return contrastArms({ pluginDir, contrast });
  return [comparisonArm({ pluginId, mainDir }), { name: 'with', pluginDir, flags: ['--plugin-dir', pluginDir] }];
}

function splitSettings(flags, outputStyle) {
  const settingsAt = flags.indexOf('--settings');
  if (settingsAt === -1) return { settings: outputStyle === undefined ? undefined : { outputStyle }, pluginFlags: flags };
  const armSettings = JSON.parse(flags[settingsAt + 1]);
  return {
    settings: outputStyle === undefined ? armSettings : { ...armSettings, outputStyle },
    pluginFlags: flags.filter((_, at) => at !== settingsAt && at !== settingsAt + 1)
  };
}

function startRun(job, { arm, runNumber }) {
  const { model, effort, promptText, options, gradeLines, judge } = job;
  const { settingSources, outputStyle, setupScript, home, grade, promptFile } = options;
  if (setupScript !== undefined) {
    const setup = runCaseSetup(setupScript);
    if (setup.exit !== 0) return { setupExit: setup.exit, stderr: setup.stderr };
  }
  const { scratch, tmp, roots } = makeRunFolder(arm.name, setupScript);
  const { settings, pluginFlags } = splitSettings(arm.flags, outputStyle);
  const args = claudeArguments({ model, effort, promptText, settingSources, pluginFlags });
  const confined = withHome(confinedClaude({ args, roots, cwd: scratch, tmp, settings }), home);
  const ran = runArm({ ...confined, env: { ...confined.env, ...arm.env } });
  if (!grade) return ran;
  return ran.then((outcome) => ({
    ...outcome,
    grade: gradeRun({ case: path.basename(promptFile), arm: arm.name, run: runNumber, lines: gradeLines, answer: outcome.finalText ?? '', dir: setupScript === undefined ? scratch : roots[2], judge, votes: grade.votes })
  }));
}

function addToTotal(totals, armName, outcome) {
  const cost = typeof outcome.cost === 'number';
  const tokens = Boolean(outcome.tokens);
  if (!cost && !tokens) return;
  const total = totals.get(armName) ?? {};
  if (cost) total.cost = (total.cost ?? 0) + outcome.cost;
  if (tokens) total.tokens = { input: (total.tokens?.input ?? 0) + outcome.tokens.input, output: (total.tokens?.output ?? 0) + outcome.tokens.output };
  totals.set(armName, total);
}

function runLine({ arm, runNumber }, outcome, file) {
  const skills = outcome.skills.length > 0 ? outcome.skills.join(', ') : 'none';
  const cost = typeof outcome.cost === 'number' ? ` [cost: $${outcome.cost.toFixed(4)}]` : '';
  const tokens = outcome.tokens ? ` [tokens: in=${outcome.tokens.input} out=${outcome.tokens.output}]` : '';
  const unopened = outcome.unopened.map((citation) => ` [unopened citation: ${citation}]`).join('');
  return `  ${arm.name} ${runNumber}: ${file} [first edit/write: ${outcome.firstAction ?? 'none'}] [skills: ${skills}]${cost}${tokens}${unopened}`;
}

function reportWrongRuns({ arm, runNumber }, outcome) {
  let failed = false;
  if (arm.outputStyle !== undefined && outcome.outputStyle !== arm.outputStyle) {
    failed = true;
    console.log(`  WRONG STYLE ${arm.name} ${runNumber}: init event reports '${outcome.outputStyle ?? 'none'}', arm expects '${arm.outputStyle}'`);
  }
  for (const dir of wrongCopies(outcome.skillDirs, arm.pluginDir)) {
    failed = true;
    console.log(`  WRONG COPY ${arm.name} ${runNumber}: ${dir} is not under ${arm.pluginDir}`);
  }
  return failed;
}

function printTotals(totals) {
  for (const [name, { cost, tokens }] of totals) {
    const parts = [cost === undefined ? '' : `$${cost.toFixed(4)}`, tokens ? `[tokens: in=${tokens.input} out=${tokens.output}]` : ''];
    console.log(`  total ${name}: ${parts.filter(Boolean).join(' ')}`);
  }
}

function reportOutcomes(planned, outcomes, { model, effort, outDir }) {
  let failed = false;
  const grades = [];
  const totals = new Map();
  planned.forEach((run, index) => {
    const { arm, runNumber } = run;
    const outcome = outcomes[index];
    const file = path.join(outDir, `${fileSafe(model)}-${fileSafe(effort)}-${arm.name}-${runNumber}.md`);
    fs.writeFileSync(file, answerText(outcome));
    if (outcome.setupExit !== undefined) {
      failed = true;
      console.log(`  ${arm.name} ${runNumber}: ${file} [setup failed: exit ${outcome.setupExit}]`);
      return;
    }
    if (outcome.grade) grades.push(recordRun(outcome.grade, outcome));
    addToTotal(totals, arm.name, outcome);
    console.log(runLine(run, outcome, file));
    if (outcome.unopened.length > 0) failed = true;
    if (reportWrongRuns(run, outcome)) failed = true;
  });
  printTotals(totals);
  return { failed, grades };
}

async function runCell({ model, effort }, promptText, options) {
  const { contrast, setupScript, runs, grade, promptFile, outDir } = options;
  const gradeLines = grade && linesForCase(parseCriteria(fs.readFileSync(grade.criteriaFile, 'utf8')), path.basename(promptFile));
  const judge = grade && defaultJudge(grade.judgeCell);
  const job = { model, effort, promptText, options, gradeLines, judge };
  const planned = cellArms(options).flatMap((arm) => Array.from({ length: runs }, (_, index) => ({ arm, runNumber: index + 1 })));
  const start = (run) => startRun(job, run);
  const outcomes = setupScript === undefined
    ? await Promise.all(planned.map(start))
    : await runInSequence(planned, start);
  console.log(`${model}:${effort}${contrast === undefined ? '' : ` ${contrast.name}: with=${contrast.values[0]} contrast=${contrast.values[1]}`}`);
  return reportOutcomes(planned, outcomes, { model, effort, outDir });
}
export async function runOneCell(cell, promptText, options) {
  const { gradesByCell, ...cellOptions } = options;
  const { failed, grades } = await runCell(cell, promptText, cellOptions);
  if (failed) process.exitCode = 1;
  gradesByCell[`${cell.model}:${cell.effort}`] = grades;
}
