#!/usr/bin/env node

import { plantHandover } from '../handover.mjs';

const RESULT = `# Orchestrate: sessions

## Phase 1
- ttl-unit: phase 1, DONE. Worker return: "DONE ttl-unit. The token lifetime is \`ttl\` at src/auth.mjs:1, \`export const ttl = 3_600_000;\`, so it is in milliseconds. No file changed."

## Phase 2 (next)
- expiry: phase 2, not started. Add \`expiresAt(token)\` to \`src/expiry.mjs\`: the instant in milliseconds at which the token expires, its \`issuedAt\` plus the lifetime \`ttl\` from \`src/auth.mjs\`. Needs ttl-unit. Add a test.

Remains: phase 2.
`;

plantHandover(() => ({ '.exo/orchestrate/result.md': RESULT }));
