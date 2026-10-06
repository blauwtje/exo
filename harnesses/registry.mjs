// Every harness the installer knows. A harness is one folder under harnesses/
// with an adapter.mjs exporting `name`, `label`, `detect(env)`, `install(plan)`,
// `update(record)` and `remove(record)` (see install.mjs for the arguments);
// adding one is an import and a line in this list.

export const adapters = [];
