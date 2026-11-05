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
import { claudeArguments, runArm, runInSequence, runSetup } from './pressure-run.mjs';
import { makeRunFolder } from './pressure-run-folder.mjs';

async function runCell({ model, effort }, promptText, { pluginDir, pluginId, mainDir, contrast, settingSources, outputStyle, setupScript, runs, outDir, home, grade, promptFile }) {
  const gradeLines = grade && linesForCase(parseCriteria(fs.readFileSync(grade.criteriaFile, 'utf8')), path.basename(promptFile));
  const judge = grade && defaultJudge(grade.judgeCell);
  const arms = contrast === undefined
    ? [comparisonArm({ pluginId, mainDir }), { name: 'with', pluginDir, flags: ['--plugin-dir', pluginDir] }]
    : contrastArms({ pluginDir, contrast });
  const planned = arms.flatMap((arm) => Array.from({ length: runs }, (_, index) => ({ arm, runNumber: index + 1 })));
  const startRun = ({ arm, runNumber }) => {
    if (setupScript !== undefined) {
      const setup = runSetup(setupScript);
      if (setup.exit !== 0) return { setupExit: setup.exit, stderr: setup.stderr };
    }
    const { scratch, tmp, roots } = makeRunFolder(arm.name, setupScript);
    const settingsAt = arm.flags.indexOf('--settings');
    const armSettings = settingsAt === -1 ? undefined : JSON.parse(arm.flags[settingsAt + 1]);
    const settings = outputStyle === undefined ? armSettings : { ...armSettings, outputStyle };
    const pluginFlags = settingsAt === -1 ? arm.flags : arm.flags.filter((_, at) => at !== settingsAt && at !== settingsAt + 1);
    const args = claudeArguments({ model, effort, promptText, settingSources, pluginFlags });
    const confined = withHome(confinedClaude({ args, roots, cwd: scratch, tmp, settings }), home);
    const ran = runArm({ ...confined, env: { ...confined.env, ...arm.env } });
    if (!grade) return ran;
    return ran.then((outcome) => ({
      ...outcome,
      grade: gradeRun({ case: path.basename(promptFile), arm: arm.name, run: runNumber, lines: gradeLines, answer: outcome.finalText ?? '', dir: setupScript === undefined ? scratch : roots[2], judge, votes: grade.votes })
    }));
  };
  const outcomes = setupScript === undefined
    ? await Promise.all(planned.map(startRun))
    : await runInSequence(planned, startRun);
  console.log(`${model}:${effort}${contrast === undefined ? '' : ` ${contrast.name}: with=${contrast.values[0]} contrast=${contrast.values[1]}`}`);
  let failed = false;
  const grades = [];
  const totals = new Map();
  planned.forEach(({ arm, runNumber }, index) => {
    const outcome = outcomes[index];
    const file = path.join(outDir, `${fileSafe(model)}-${fileSafe(effort)}-${arm.name}-${runNumber}.md`);
    fs.writeFileSync(file, answerText(outcome));
    if (outcome.setupExit !== undefined) {
      failed = true;
      console.log(`  ${arm.name} ${runNumber}: ${file} [setup failed: exit ${outcome.setupExit}]`);
      return;
    }
    if (outcome.grade) grades.push(recordRun(outcome.grade, outcome));
    const skills = outcome.skills.length > 0 ? outcome.skills.join(', ') : 'none';
    const cost = typeof outcome.cost === 'number' ? ` [cost: $${outcome.cost.toFixed(4)}]` : '';
    const tokens = outcome.tokens ? ` [tokens: in=${outcome.tokens.input} out=${outcome.tokens.output}]` : '';
    const total = totals.get(arm.name) ?? {};
    if (cost !== '') total.cost = (total.cost ?? 0) + outcome.cost;
    if (tokens !== '') total.tokens = { input: (total.tokens?.input ?? 0) + outcome.tokens.input, output: (total.tokens?.output ?? 0) + outcome.tokens.output };
    if (cost !== '' || tokens !== '') totals.set(arm.name, total);
    const unopened = outcome.unopened.map((citation) => ` [unopened citation: ${citation}]`).join('');
    console.log(`  ${arm.name} ${runNumber}: ${file} [first edit/write: ${outcome.firstAction ?? 'none'}] [skills: ${skills}]${cost}${tokens}${unopened}`);
    if (unopened !== '') failed = true;
    if (arm.outputStyle !== undefined && outcome.outputStyle !== arm.outputStyle) {
      failed = true;
      console.log(`  WRONG STYLE ${arm.name} ${runNumber}: init event reports '${outcome.outputStyle ?? 'none'}', arm expects '${arm.outputStyle}'`);
    }
    for (const dir of wrongCopies(outcome.skillDirs, arm.pluginDir)) {
      failed = true;
      console.log(`  WRONG COPY ${arm.name} ${runNumber}: ${dir} is not under ${arm.pluginDir}`);
    }
  });
  for (const [name, { cost, tokens }] of totals) {
    const parts = [cost === undefined ? '' : `$${cost.toFixed(4)}`, tokens ? `[tokens: in=${tokens.input} out=${tokens.output}]` : ''];
    console.log(`  total ${name}: ${parts.filter(Boolean).join(' ')}`);
  }
  return { failed, grades };
}

export async function runOneCell(cell, promptText, options) {
  const { gradesByCell, ...cellOptions } = options;
  const { failed, grades } = await runCell(cell, promptText, cellOptions);
  if (failed) process.exitCode = 1;
  gradesByCell[`${cell.model}:${cell.effort}`] = grades;
}
