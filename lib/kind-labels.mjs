import { EFFORTS } from './model-kinds.mjs';

export function pairText(model, effort) {
  return `${model ?? 'the session model'}, ${effort ?? 'the session effort'}`;
}

export function runsPassed(kind, passed) {
  return Object.entries(passed).every(([key, value]) => kind[key] === value);
}

export function kindLabels(kinds, passed) {
  const entries = Object.entries(kinds);
  const names = (list) => list.map(([name]) => name).join(', ');
  const exact = entries.filter(([, kind]) => runsPassed(kind, passed));
  if (exact.length) return `\`exo-kind:\` labels for ${pairText(passed.model, passed.effort)}: ${names(exact)}`;
  const gap = ([, kind]) => Math.abs(EFFORTS.indexOf(kind.effort) - EFFORTS.indexOf(passed.effort));
  const sameModel = entries.filter(([, kind]) => kind.model === passed.model);
  const nearest = sameModel.filter((entry) => gap(entry) === Math.min(...sameModel.map(gap)));
  if (!nearest.length) return `No kind runs ${pairText(passed.model, passed.effort)}, and none runs ${passed.model ?? 'that model'}`;
  return `No kind runs ${pairText(passed.model, passed.effort)}; closest on ${passed.model}: ${names(nearest)}`;
}
