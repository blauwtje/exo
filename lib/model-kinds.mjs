// The task-kind table: one tier and effort level per kind of task, and the
// agent files, skill frontmatter fields, prompt-file dispatch lines and
// next-stage lines that belong to each kind. `lib/model-kinds.json` holds the
// data; this module reads it, resolves each kind through the active provider
// block, and rejects a table that names an unknown kind, tier, effort or
// provider value. The returned `kinds` hold the provider's `model` and
// `effort`, so a caller never sees a tier. Imported as `#model-kinds`.
// `effort: null` means the kind sets none. The tier `inherit` resolves to the
// model `inherit`: the session's own model, which a dispatch sets by omitting
// `model`.

import { readFileSync } from 'node:fs';

export const TABLE_PATH = new URL('./model-kinds.json', import.meta.url);
export const TIERS = ['strong', 'standard', 'fast'];
export const INHERIT = 'inherit';
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const SKILL_FIELDS = ['model', 'effort'];

function readProvider(table) {
  const provider = table.providers[table.provider];
  if (!provider) {
    throw new Error(`unknown provider ${table.provider}`);
  }
  for (const tier of TIERS) {
    const model = provider.tiers[tier];
    if (!model) {
      throw new Error(`provider ${table.provider}: no model for tier ${tier}`);
    }
    if (model !== INHERIT && !provider.models?.includes(model)) {
      throw new Error(`provider ${table.provider}: tier ${tier} names ${model}, which models does not list`);
    }
  }
  for (const effort of EFFORTS) {
    if (!provider.efforts[effort]) {
      throw new Error(`provider ${table.provider}: no value for effort ${effort}`);
    }
  }
  return provider;
}

function resolveKinds(table, provider) {
  const kinds = {};
  for (const [name, kind] of Object.entries(table.kinds)) {
    if (kind.tier !== INHERIT && !TIERS.includes(kind.tier)) {
      throw new Error(`kind ${name}: unknown tier ${kind.tier}`);
    }
    if (kind.effort !== null && !EFFORTS.includes(kind.effort)) {
      throw new Error(`kind ${name}: unknown effort ${kind.effort}`);
    }
    kinds[name] = {
      model: kind.tier === INHERIT ? INHERIT : provider.tiers[kind.tier],
      effort: kind.effort === null ? null : provider.efforts[kind.effort]
    };
  }
  return kinds;
}

function checkBudgets(table, provider) {
  for (const [value, pairs] of Object.entries(table.budgets ?? {})) {
    for (const [fromTier, toTier] of Object.entries(pairs)) {
      if (!provider.tiers[fromTier] || !provider.tiers[toTier]) {
        throw new Error(`budgets.${value}: ${fromTier} to ${toTier} names a tier the provider lacks`);
      }
    }
  }
}

export function readKindTable(path = TABLE_PATH) {
  const table = JSON.parse(readFileSync(path, 'utf8'));
  const provider = readProvider(table);
  const kinds = resolveKinds(table, provider);
  checkBudgets(table, provider);
  const members = [
    ...Object.entries(table.agents),
    ...Object.entries(table.skills),
    ...Object.entries(table.stages).map(([stage, entry]) => [`stage ${stage}`, entry]),
    ...table.dispatches.map((dispatch) => [dispatch.file, dispatch])
  ];
  for (const [file, member] of members) {
    if (!(member.kind in kinds)) {
      throw new Error(`${file}: unknown kind ${member.kind}`);
    }
  }
  for (const [file, skill] of Object.entries(table.skills)) {
    const unknown = skill.fields.find((field) => !SKILL_FIELDS.includes(field));
    if (unknown) {
      throw new Error(`${file}: unknown field ${unknown}`);
    }
  }
  return { ...table, kinds };
}
