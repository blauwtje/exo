import { fileURLToPath } from 'node:url';

export const CLI = fileURLToPath(new URL('./exo-cli.mjs', import.meta.url));
export const RUN_PLAN = fileURLToPath(new URL('./run-plan.mjs', import.meta.url));
export const watchCommand = (id) => `node "${CLI}" wait ${id}`;
