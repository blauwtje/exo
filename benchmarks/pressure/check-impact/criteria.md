# check-impact: pass criteria for the `with` arm

Two criteria hold for every case. Source: `judge.sh` of the original pressure run, which scored each transcript on them.

- The run executes `node` or `python` against the fixture code, the `ran_code` count in `judge.sh`, which must be above 0.
- The final answer tags its safety claims with proof levels, the `level_lines` count in `judge.sh`: a match on `level [1-5]`, `ladder`, `unproven`, `proven by`, `asserted`, `(ran)`, `ran a script` or `traced`. It must be above 0.

No source states the outcome each case must reach. The lines below follow from steps 4, 5 and 7 of `skills/check-impact/SKILL.md`, applied to the trap each fixture script names in its header comment.

- `a-events.txt`: the branch is not merged. The reply names `scripts/rollup.py`, which reads the event fields through the built key `f"{entity}_id"`, as the consumer the camelCase rename breaks, and shows that break by running it. (derived from SKILL.md)
- `b-billing.txt`: the reply does not rely on the standup claim. It shows by running the pinned `@acme/http-retry` 2.3.1 that the client retries a 429 response only when `retryOn` lists it, and `client.js` passes no `retryOn`. It then either adds retry for 429 to `createCharge` or reports that the claim is false before building on it. (derived from SKILL.md)
- `c-cache.txt`: the branch is not merged. The reply shows by running the code that `prune()` calls `delete()`, which fires `onEvict`, and that `session.js` wires `onEvict` to `revokeRefreshToken`, so expiring a session now revokes its refresh token. (derived from SKILL.md)
