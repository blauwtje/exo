import fs from 'node:fs';
import path from 'node:path';

export function existingBase(value) {
  const resolved = path.resolve(value);
  if (!fs.existsSync(resolved)) throw new Error(`--base ${resolved} does not exist`);
  return resolved;
}

export function rejectBaseVariants(base, variants) {
  if (base !== null && variants.length > 0) throw new Error('--base cannot run a cell with a plugin variant: variant copies are made from this checkout only');
}

function armCell(cell, arm, pluginDir) {
  const repeat = cell.repeat ?? 1;
  return { ...cell, arm, pluginDir, repeat, directory: `${cell.id}-${repeat}-${arm}` };
}

export function pairCells(cells, { base, candidate }) {
  return cells.map((cell) => {
    const baseArm = armCell(cell, 'base', base);
    const candidateArm = armCell(cell, 'cand', candidate);
    return (baseArm.repeat % 2 === 1) ? [baseArm, candidateArm] : [candidateArm, baseArm];
  });
}

export async function runPairs(pairs, concurrency, runArm) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(Math.ceil(concurrency / 2), pairs.length) }, async () => {
    while (next < pairs.length) {
      const index = next;
      next += 1;
      await Promise.all(pairs[index].map((arm) => runArm(arm, index)));
    }
  });
  await Promise.all(lanes);
}
