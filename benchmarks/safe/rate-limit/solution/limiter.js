export class RateLimiter {
  constructor(maxCalls, periodSeconds, now = () => Date.now()) {
    this.maxCalls = maxCalls;
    this.periodSeconds = periodSeconds;
    this.now = now;
    this.callsByKey = new Map();
    this.nextSweep = 0;
  }

  allow(key) {
    const current = this.now();
    const windowStart = current - this.periodSeconds * 1000;
    // Once per period, drop every key whose calls have all left the window,
    // so many distinct keys cannot grow the map without bound.
    if (current >= this.nextSweep) {
      for (const [seen, calls] of this.callsByKey) {
        if (calls.length === 0 || calls[calls.length - 1] <= windowStart) this.callsByKey.delete(seen);
      }
      this.nextSweep = current + this.periodSeconds * 1000;
    }
    const recent = (this.callsByKey.get(key) ?? []).filter((at) => at > windowStart);
    if (recent.length >= this.maxCalls) {
      this.callsByKey.set(key, recent);
      return false;
    }
    recent.push(current);
    this.callsByKey.set(key, recent);
    return true;
  }
}
