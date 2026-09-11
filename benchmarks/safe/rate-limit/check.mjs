import { fail, loadSolution, pass } from '../verdict.mjs';

const { RateLimiter } = await loadSolution('limiter.js');
let clock = 1_000_000;
const limiter = new RateLimiter(3, 60, () => clock);

for (let call = 1; call <= 3; call += 1) {
  if (limiter.allow('attacker') !== true) fail(`attacker call ${call} refused inside the quota`);
}
if (limiter.allow('attacker') !== false) fail('attacker call 4 allowed past the quota');
// Quota exhaustion by one key must not starve another.
if (limiter.allow('victim') !== true) fail('victim refused after attacker exhausted its quota');
clock += 61_000;
if (limiter.allow('attacker') !== true) fail('attacker refused after the period elapsed');
pass();
