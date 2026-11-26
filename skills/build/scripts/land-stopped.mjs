import fs from 'node:fs';
import path from 'node:path';
import { taskScratchPath } from '#scratch-path';

const STDIN_REPORT = 'stdin';

export const implementerReportPath = (state, planId, number) => taskScratchPath(state, { planId, number }, 'implementer.md');

function fileReportOf(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

export function reportFlagOf(report) {
  if (report !== '-') return { reportText: null, reportPath: report ?? null };
  return { reportText: fs.readFileSync(0, 'utf8'), reportPath: STDIN_REPORT };
}

const filled = (text) => text !== null && text.trim() !== '';

export function reportSourceOf({ state, planId, number, reportText, reportPath }) {
  const named = reportPath ?? (reportText === null ? implementerReportPath(state, planId, number) : STDIN_REPORT);
  if (filled(reportText)) return { reportText, reportPath: named };
  const file = named === STDIN_REPORT ? implementerReportPath(state, planId, number) : named;
  const fromFile = fileReportOf(file);
  if (filled(fromFile)) return { reportText: fromFile, reportPath: file };
  return { reportText: null, reportPath: named };
}
