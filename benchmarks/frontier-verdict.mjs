export const PROMOTE = 'promote';
export const HOLD = 'hold';
export const WORSE = 'worse';

function endpoints(cell) {
  const costs = cell.map((point) => point.cost);
  const walls = cell.map((point) => point.wall);
  return { cost: Math.min(...costs), wall: Math.min(...walls) };
}

function assertCell(cell, name) {
  if (!Array.isArray(cell) || cell.length === 0) throw new RangeError(`${name} cell needs at least one cost and wall pair`);
}

export function frontierVerdict({ base, candidate }) {
  assertCell(base, 'base');
  assertCell(candidate, 'candidate');
  const from = endpoints(base);
  const to = endpoints(candidate);
  const costDelta = to.cost - from.cost;
  const wallDelta = to.wall - from.wall;
  if (costDelta > 0 || wallDelta > 0) return WORSE;
  if (costDelta < 0 || wallDelta < 0) return PROMOTE;
  return HOLD;
}

export function replayFlips(cases) {
  const flipped = cases.filter((entry) => entry.verdict === PROMOTE && frontierVerdict(entry) !== PROMOTE);
  return { total: cases.length, flipped: flipped.length, ids: flipped.map((entry) => entry.id) };
}
