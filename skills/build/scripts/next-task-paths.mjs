import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SKILL_DIRECTORY = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const GATE_DIRECTORY = path.join(path.dirname(SKILL_DIRECTORY), 'gate');

export const scriptPath = (name) => path.join(SKILL_DIRECTORY, 'scripts', name);
