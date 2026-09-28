// The task-kind table: one model and effort level per kind of task, and the
// agent files, skill frontmatter fields and prompt-file dispatch lines that
// belong to each kind. `lib/model-kinds.json` holds the data; this module
// reads it and rejects a table that names an unknown kind, model or effort.
// Imported as `#model-kinds`. `effort: null` means the kind sets none.

import { readFileSync } from 'node:fs';

export const TABLE_PATH = new URL('./model-kinds.json', import.meta.url);
export const MODELS = ['opus', 'sonnet', 'haiku'];
export const EFFORTS = ['low', 'medium', 'high', 'max'];
export const SKILL_FIELDS = ['model', 'effort'];

export function readKindTable(path = TABLE_PATH) {
  const table = JSON.parse(readFileSync(path, 'utf8'));
  for (const [name, kind] of Object.entries(table.kinds)) {
    if (!MODELS.includes(kind.model)) {
      throw new Error(`kind ${name}: unknown model ${kind.model}`);
    }
    if (kind.effort !== null && !EFFORTS.includes(kind.effort)) {
      throw new Error(`kind ${name}: unknown effort ${kind.effort}`);
    }
  }
  const members = [
    ...Object.entries(table.agents),
    ...Object.entries(table.skills),
    ...table.dispatches.map((dispatch) => [dispatch.file, dispatch])
  ];
  for (const [file, member] of members) {
    if (!(member.kind in table.kinds)) {
      throw new Error(`${file}: unknown kind ${member.kind}`);
    }
  }
  for (const [file, skill] of Object.entries(table.skills)) {
    const unknown = skill.fields.find((field) => !SKILL_FIELDS.includes(field));
    if (unknown) {
      throw new Error(`${file}: unknown field ${unknown}`);
    }
  }
  return table;
}
