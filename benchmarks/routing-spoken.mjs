import { armComparison, comparisonLine, routingStats, statsLines } from './routing-stats.mjs';

export function spokenSplit(sessions) {
  const accuracy = (spoken) => {
    const group = sessions.filter((session) => Boolean(session.spoken) === spoken && session.error === undefined);
    const right = group.filter((session) => session.pick === session.expect).length;
    return { trials: group.length, accuracy: group.length ? right / group.length : null };
  };
  return { spoken: accuracy(true), typed: accuracy(false) };
}

function spokenLine(sessions, cell) {
  const hook = sessions.filter((session) => session.cell === cell && session.arm === 'hook');
  return `spoken/typed ${JSON.stringify(spokenSplit(hook))}\n`;
}

export function printStats(result, cells) {
  for (const cell of cells) {
    const stats = statsLines(routingStats(result.sessions, { cell })).join('\n');
    const comparison = comparisonLine(armComparison(result.sessions, { cell })) ?? 'no hook against no-hook pairs';
    process.stdout.write(`${cell} hook\n${stats}\n${comparison}\n${spokenLine(result.sessions, cell)}`);
  }
}
