import { BUDGETS, readKindTable } from '#model-kinds';
import { UsageError } from '#script-flags';

export function cellsFor(file) {
  const cells = new Set();
  for (const budget of BUDGETS) {
    const table = readKindTable(undefined, { budget });
    const entries = [table.agents[file], ...table.dispatches.filter((dispatch) => dispatch.file === file)];
    for (const entry of entries.filter(Boolean)) {
      const { model, effort } = table.kinds[entry.kind];
      cells.add(`${model}:${effort ?? 'session'}`);
    }
  }
  if (cells.size === 0) throw new UsageError(`no kind in lib/model-kinds.json lists '${file}'`);
  return [...cells].join(',');
}
