import fs from 'node:fs';
import path from 'node:path';
import { frameOf } from '#plan-frame';
import { parsePlan } from '#plan-tasks';
import { Refusal } from './cli-refusal.mjs';

export function newestPlan(root) {
  const plans = ['specs', 'plans'].flatMap((folder) => {
    let names = [];
    try {
      names = fs.readdirSync(path.join(root, 'docs', folder));
    } catch {
      return [];
    }
    return names
      .filter((name) => name.endsWith('.md') && !name.endsWith('-decisions.md'))
      .map((name) => path.join(root, 'docs', folder, name));
  });
  return plans.map((file) => ({ file, time: fs.statSync(file).mtimeMs })).sort((a, b) => b.time - a.time)[0]?.file ?? null;
}

export function planFrame(plan) {
  try {
    return frameOf(parsePlan(fs.readFileSync(plan, 'utf8')).frame);
  } catch (error) {
    throw new Refusal(`cannot read ${plan}: ${error.message}`);
  }
}
