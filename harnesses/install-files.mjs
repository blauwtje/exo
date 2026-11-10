import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const isPlain = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
export const hashOf = (content) => crypto.createHash('sha256').update(content).digest('hex');
export const statOf = (file) => fs.lstatSync(file, { throwIfNoEntry: false });

export function plainChain(base, parts) {
  let current = base;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    const stat = statOf(current);
    if (stat === undefined) return true;
    if (!stat.isDirectory()) return false;
  }
  return true;
}

export function readRecord(file, action) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${file} does not parse (${error.message}); fix or move it, nothing was ${action}`);
  }
}

export const sameInstall = (left, right) => left.scope === right.scope && left.project === right.project;

export const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function apply(plan) {
  for (const write of plan.writes) write();
  return { summary: plan.summary, notes: plan.notes };
}

export const combine = (results) => ({ summary: results.map((result) => result.summary).join('; '), notes: results.flatMap((result) => result.notes) });

export function removeInstalls(record, adapter) {
  const { recordFile } = adapter.locations(record.env);
  const installs = adapter.readInstalls(recordFile);
  const wanted = installs.filter((entry) => adapter.matches(entry, record));
  if (wanted.length === 0) return `nothing to remove: ${recordFile} lists no matching install`;
  let remaining = installs;
  const plans = wanted.map((entry) => {
    const plan = adapter.planRemove(entry, remaining, record.env);
    remaining = remaining.filter((candidate) => !sameInstall(candidate, entry));
    return plan;
  });
  return combine(plans.map(apply));
}
