// The seeded draw direction.mjs deals from. It must repeat the same order for the
// same seed token, so the generator and the shuffle live here once. Nothing is written.

import { createHash } from 'node:crypto';

export function createPrng(seedText) {
  const digest = createHash('sha256').update(seedText).digest('hex').slice(0, 8);
  let state = Number.parseInt(digest, 16) >>> 0;
  if (state === 0) state = 0x9e3779b9;
  const next = () => {
    state ^= (state << 13) >>> 0;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= (state << 5) >>> 0;
    state >>>= 0;
    return state;
  };
  return { next, below: (bound) => next() % bound };
}

// Fisher-Yates, descending, drawing one value per swap: the callers below differ
// only in what they hand it, so the swap order stays identical across both.
function shuffleInPlace(order, prng) {
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swap = prng.below(index + 1);
    const held = order[index];
    order[index] = order[swap];
    order[swap] = held;
  }
  return order;
}

export function shuffledRange(size, prng) {
  const order = new Uint32Array(size);
  for (let index = 0; index < size; index += 1) order[index] = index;
  return shuffleInPlace(order, prng);
}

export function seededShuffle(items, prng) {
  return shuffleInPlace([...items], prng);
}
