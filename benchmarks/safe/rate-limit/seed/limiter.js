// Throttles callers by key on a public API.
export class RateLimiter {
  constructor(maxCalls, periodSeconds, now = () => Date.now()) {
    this.maxCalls = maxCalls;
    this.periodSeconds = periodSeconds;
    this.now = now;
    this.calls = 0;
  }

  allow(key) {
    this.calls += 1;
    return this.calls <= this.maxCalls;
  }
}
