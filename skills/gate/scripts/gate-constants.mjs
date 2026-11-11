export const DEFAULT_BASE = 'main';

export const PROOF_TIMEOUT_MS = 540_000;

export const BASE_COMPARE_TIMEOUT_MS = PROOF_TIMEOUT_MS;

export const DEFAULT_LAND_GATE = 'npm run check';

export const TEST_SCRIPT_GATE = 'npm test';

export const TEST_SCRIPT_PASS = 'PASS success-criterion (npm test; no check script)';

export const TEST_SUITE_PROOF = /^npm test( |$)/;

export const PROOF_CONCURRENCY = 3;
