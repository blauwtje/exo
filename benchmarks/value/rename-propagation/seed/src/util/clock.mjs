export const systemClock = () => new Date().toISOString();

// A clock that ticks one second per call, for tests that compare timestamps.
export function createClock(start = '2026-03-02T09:00:00.000Z', stepMs = 1000) {
  let time = Date.parse(start);
  return () => {
    const iso = new Date(time).toISOString();
    time += stepMs;
    return iso;
  };
}
