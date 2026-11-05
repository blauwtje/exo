import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gradeRun, linesForCase, parseCriteria } from './pressure-grade.mjs';
import { ANSWER_FILE, fileSafe } from './pressure-answers.mjs';

function gradeSavedAnswers(runFolder, { promptFile, grade, judge }, emptyDir) {
  const lines = linesForCase(parseCriteria(fs.readFileSync(grade.criteriaFile, 'utf8')), path.basename(promptFile));
  const summaryFile = path.join(runFolder, 'grades.json');
  const prior = fs.existsSync(summaryFile) ? JSON.parse(fs.readFileSync(summaryFile, 'utf8')) : {};
  const gradesByCell = {};
  for (const name of fs.readdirSync(runFolder).sort()) {
    const match = ANSWER_FILE.exec(name);
    if (!match) continue;
    const [, model, effort, arm, run] = match;
    const safeCell = `${model}:${effort}`;
    const cell = Object.keys(prior).find((key) => key.split(':').map(fileSafe).join(':') === safeCell) ?? safeCell;
    const answer = fs.readFileSync(path.join(runFolder, name), 'utf8');
    const graded = gradeRun({ case: path.basename(promptFile), arm, run: Number(run), lines, answer, dir: emptyDir, judge, votes: grade.votes });
    const before = (prior[cell]?.runs ?? []).find((saved) => saved.arm === arm && saved.run === Number(run));
    (gradesByCell[cell] ??= []).push({ ...graded, durationMs: before?.durationMs, cost_usd: before?.cost_usd });
  }
  return gradesByCell;
}

export function regradeFolder(runFolder, options) {
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pressure-regrade-'));
  try {
    return gradeSavedAnswers(runFolder, options, emptyDir);
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
}
