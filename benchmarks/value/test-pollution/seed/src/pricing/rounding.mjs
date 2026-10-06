import { ValidationError } from '../util/errors.mjs';

function halfEven(value) {
  const floor = Math.floor(value);
  const rest = value - floor;
  if (rest < 0.5) return floor;
  if (rest > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

const MODES = {
  'half-up': Math.round,
  'half-even': halfEven,
  floor: Math.floor,
  ceil: Math.ceil,
};

let activeMode = 'half-up';

export function useRounding(mode) {
  if (!MODES[mode]) throw new ValidationError(`unknown rounding mode "${mode}"`);
  activeMode = mode;
}

export function roundCents(value) {
  return MODES[activeMode](value);
}
