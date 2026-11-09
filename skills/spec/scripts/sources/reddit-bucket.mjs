import { BlockedRoute } from './http.mjs';

export function createBucket({ capacity, refillMs, now, sleep, hostState, host, maxWaitMs = Infinity }) {
  const state = { tokens: capacity, checkedAt: now() };

  function refill() {
    const elapsed = now() - state.checkedAt;
    state.checkedAt += elapsed;
    state.tokens = Math.min(capacity, state.tokens + elapsed / refillMs);
  }

  async function pauseFor(ms) {
    if (ms > maxWaitMs) throw new BlockedRoute(`rate limit wait of ${ms} ms is over the ${maxWaitMs} ms cap`);
    await sleep(ms);
  }

  async function take() {
    const shared = hostState ? hostState.budgetWaitMs(host) : 0;
    if (shared > 0) await pauseFor(shared);
    refill();
    if (state.tokens >= 1) {
      state.tokens -= 1;
      return;
    }
    await pauseFor(Math.ceil((1 - state.tokens) * refillMs));
    return take();
  }

  return { take };
}
