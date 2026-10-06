// Every harness the installer knows. A harness is one folder under harnesses/
// with an adapter.mjs exporting `name`, `label`, `detect(env)`, `install(plan)`,
// `update(record)`, `remove(record)` and `recorded(env)` (see install.mjs for the arguments);
// adding one is an import and a line in this list.

import * as claude from './claude/adapter.mjs';
import * as codex from './codex/adapter.mjs';

export const adapters = [claude, codex];
