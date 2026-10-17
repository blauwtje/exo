import fs from 'node:fs';
import path from 'node:path';

function mean(values) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pastRecords(runsRoot) {
  const byId = new Map();
  let unreadable = 0;
  if (!fs.existsSync(runsRoot)) return { byId, unreadable };
  for (const file of fs.readdirSync(runsRoot, { recursive: true })) {
    if (path.basename(file) !== 'record.json') continue;
    let record;
    try {
      record = JSON.parse(fs.readFileSync(path.join(runsRoot, file), 'utf8'));
    } catch (error) {
      unreadable += 1;
      continue;
    }
    if (typeof record?.id !== 'string') continue;
    byId.set(record.id, [...(byId.get(record.id) ?? []), record]);
  }
  return { byId, unreadable };
}

export function projectSweep(cellIds, runsRoot) {
  const past = pastRecords(runsRoot);
  const projection = { costUsd: 0, wallMs: 0, fromRecords: 0, unknown: 0, costUnknown: 0, unreadable: past.unreadable };
  for (const id of cellIds) {
    const records = past.byId.get(id) ?? [];
    const cost = mean(records.map((record) => record.costUsd).filter((value) => typeof value === 'number'));
    const wall = mean(records.map((record) => record.wallMs).filter((value) => typeof value === 'number'));
    if (cost === null && wall === null) {
      projection.unknown += 1;
      continue;
    }
    projection.fromRecords += 1;
    if (cost === null) projection.costUnknown += 1;
    projection.costUsd += cost ?? 0;
    projection.wallMs += wall ?? 0;
  }
  return projection;
}

export function sweepProjectionLine(projection, cellCount) {
  if (projection.fromRecords === 0) return `projected cost and time unknown: none of the ${cellCount} cells has a past record`;
  const costBound = projection.unknown + projection.costUnknown > 0 ? 'at least ' : '';
  const timeBound = projection.unknown > 0 ? 'at least ' : '';
  return `projected ${costBound}$${projection.costUsd.toFixed(2)} and ${timeBound}${(projection.wallMs / 60000).toFixed(1)} min of cell time from past records (${projection.fromRecords} of ${cellCount} cells; ${projection.unknown} have no past record; ${projection.costUnknown} have no past cost; ${projection.unreadable} unreadable record.json skipped)`;
}
