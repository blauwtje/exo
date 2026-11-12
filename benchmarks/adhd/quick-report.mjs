import fs from 'node:fs';
import { calibrationLines } from '../judge-calibration.mjs';
import { mean } from '../basics.mjs';
import { planningVariance, powerLine, tasksNeeded } from '../../lib/eval-stats.mjs';
import { gateReply } from './gates.mjs';

export function judgeStatusLines(file) {
  const rows = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
  const agentMade = rows.filter((row) => row.dimension === 'facts' && row.labeler === 'agent' && (row.label === 'PASS' || row.label === 'FAIL'));
  if (agentMade.length === 0) return calibrationLines(['adhd-facts']);
  return [`AGENT-LABELS adhd-facts n ${agentMade.length} labels made by an agent, not by the user`];
}

const unionOf = (lists) => [...new Set(lists.flat())].sort();

export function caseRowOf(group) {
  const average = (key) => mean(group.map((row) => row[key]));
  return { ...group[0], tokens: average('tokens'), visible: average('visible'), ratio: average('ratio'), billedRatio: average('billedRatio'), ratios: group.map((row) => row.ratio), failed: unionOf(group.map((row) => gateReply(row.reply, row.testCase).failed)), missing: unionOf(group.map((row) => row.missing)), answers: group.map((row) => ({ text: row.reply, failed: gateReply(row.reply, row.testCase).failed, missing: row.missing, visible: row.visible, billed: row.tokens })) };
}

const GOAL_EFFECT = 0.1;
const MAX_ANSWERS = 20;

function answersNeeded({ scores, tasks }) {
  for (let samples = 1; samples <= MAX_ANSWERS; samples += 1) {
    const variance = planningVariance({ scores, samples, paired: true });
    if (tasksNeeded({ variance, effect: GOAL_EFFECT }) <= tasks) return samples;
  }
  return `over ${MAX_ANSWERS}`;
}

export function quickPowerLine(perCase, answers) {
  if (perCase.length < 2) return 'power: needs at least two cases\n';
  const items = Object.fromEntries(perCase.map((p) => [p.id, p.ratios]));
  const scores = { base: items, candidate: items };
  const line = powerLine({ tasks: perCase.length, samples: answers, arms: 2, effect: GOAL_EFFECT, scores, paired: true });
  return `${line.replace(/MDE at/, 'MDE (lower bound) at')}; answers_per_case_needed=${answersNeeded({ scores, tasks: perCase.length })}\n`;
}
