#!/usr/bin/env node

import { plantHandover } from '../handover.mjs';

const RESULT = `# Orchestrate: catalog

## Phase 1
- tag-case: phase 1, DONE. Worker return: "DONE tag-case. normalizeTags lowercases before it drops repeats: src/tags.mjs:2 \`return [...new Set(tags.map((tag) => tag.trim().toLowerCase()))];\`. Proof: npm test → tests 2, pass 2, fail 0."

## Phase 2 (next)
- tag-index: phase 2, not started. Add \`indexTags(items)\` to \`src/index.mjs\`: map each normalized tag, \`normalizeTags\` of the item's \`tags\`, to the ids of the items that hold it, in item order, as a plain object. Needs tag-case. Add a test.

Remains: phase 2.
`;

plantHandover(() => ({ '.exo/orchestrate/result.md': RESULT }));
