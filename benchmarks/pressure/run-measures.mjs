import { meanCi } from '../../lib/eval-stats.mjs';
import { formatMeasure, measure } from '../replay/cell-stats.mjs';

const isKnown = (value) => typeof value === 'number' && Number.isFinite(value);

export function turnRecord({ timedOut, sid, text, isError, costUsd, wallMs }) {
  const aborted = timedOut === true || isError === true || !sid || !text;
  return { aborted, costUsd: isKnown(costUsd) ? costUsd : null, wallMs: isKnown(wallMs) ? wallMs : null };
}

export function runOutcome({ turns, loadedWrongCopy }) {
  if (loadedWrongCopy) return 'wrong-copy';
  return turns.some((turn) => turn.aborted) ? 'aborted' : 'completed';
}

export function runLines({ turns, outcome }) {
  const finished = turns.filter((turn) => !turn.aborted);
  const excluded = turns.length - finished.length;
  const completion = meanCi(turns.map((turn) => (turn.aborted ? 0 : 1)));
  return [
    `outcome ${outcome}${outcome === 'completed' ? '' : ' (counted as a failure)'}`,
    `finished share of turns ${formatMeasure({ ...completion, excluded: 0 })}`,
    `cost usd per finished turn ${formatMeasure(measure(finished.map((turn) => turn.costUsd)), 3, excluded)}`,
    `wall s per finished turn ${formatMeasure(measure(finished.map((turn) => (turn.wallMs === null ? null : turn.wallMs / 1000))), 1, excluded)}`
  ];
}
