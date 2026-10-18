export class RateLimiter {
  constructor(maxCalls, periodSeconds, now = () => Date.now()) {
    this.maxCalls = maxCalls;
    this.periodSeconds = periodSeconds;
    this.now = now;
    this.callsByKey = new Map();
  }

  allow(key) {
    const current = this.now();
    const windowStart = current - this.periodSeconds * 1000;
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
