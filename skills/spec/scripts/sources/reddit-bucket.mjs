export function createBucket({ capacity, refillMs, now, sleep }) {
  const state = { tokens: capacity, checkedAt: now() };

  function refill() {
    const elapsed = now() - state.checkedAt;
    state.checkedAt += elapsed;
    state.tokens = Math.min(capacity, state.tokens + elapsed / refillMs);
  }

  async function take() {
    refill();
    if (state.tokens >= 1) {
      state.tokens -= 1;
      return;
    }
    await sleep(Math.ceil((1 - state.tokens) * refillMs));
    return take();
  }

  return { take };
}
