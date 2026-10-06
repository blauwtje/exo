// The rounding mode in force. The policy is in docs/rounding-policy.md.
const MODES = new Set(['half-up', 'floor', 'ceil']);
let mode = 'half-up';

export function currentMode() {
  return mode;
}

// Runs fn under `next`, then puts the previous mode back, even when fn throws.
export function withRounding(next, fn) {
  if (!MODES.has(next)) {
    throw new RangeError(`unknown rounding mode: ${next}`);
  }
  const previous = mode;
  mode = next;
  try {
    return fn();
  } finally {
    mode = previous;
  }
}
