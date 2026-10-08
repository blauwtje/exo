// The task-kind table: one tier and effort level per kind of task, and the
// agent files, skill frontmatter fields, prompt-file dispatch lines and
// next-stage lines that belong to each kind. `lib/model-kinds.json` holds the
// data; this module reads it, resolves each kind through the active provider
// block, and rejects a table that names an unknown kind, tier, effort or
// provider value. The returned `kinds` hold the provider's `model` and
// `effort`, so a caller never sees a tier. Imported as `#model-kinds`.
// A provider block may add `effortShift` (steps up the effort list per tier,
// clamped at the last effort), `nullEffort` (the effort a kind with none gets)
// and `codexTwins` (twin name to its base agent file, kind and description,
// with `budget` resolving the kind at that budget's tier swap); Codex spawns a
// twin by name where Claude Code passes the Agent call a model and effort.
// `readKindTable(path, { provider })` reads another block than
// `table.provider`; `codexTwins` is `{}` for a block without them.
// `effort: null` means the kind sets none. The tier `inherit` resolves to the
// model `inherit`: the session's own model, which a dispatch sets by omitting
// `model`.

import { readFileSync } from 'node:fs';

export const TABLE_PATH = new URL('./model-kinds.json', import.meta.url);
export const TIERS = ['strong', 'standard', 'fast'];
export const INHERIT = 'inherit';
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const SKILL_FIELDS = ['model', 'effort'];

function readProvider(table, name) {
  const provider = table.providers[name];
  if (!provider) {
    throw new Error(`unknown provider ${name}`);
  }
  for (const tier of TIERS) {
    const model = provider.tiers[tier];
    if (!model) {
      throw new Error(`provider ${name}: no model for tier ${tier}`);
    }
    if (model !== INHERIT && !provider.models?.includes(model)) {
      throw new Error(`provider ${name}: tier ${tier} names ${model}, which models does not list`);
    }
  }
  for (const effort of EFFORTS) {
    if (!provider.efforts[effort]) {
      throw new Error(`provider ${name}: no value for effort ${effort}`);
    }
  }
  for (const tier of Object.keys(provider.effortShift ?? {})) {
    if (!TIERS.includes(tier)) {
      throw new Error(`provider ${name}: effortShift names unknown tier ${tier}`);
    }
  }
  if (provider.nullEffort !== undefined && !EFFORTS.includes(provider.nullEffort)) {
    throw new Error(`provider ${name}: nullEffort names unknown effort ${provider.nullEffort}`);
  }
  return provider;
}

function resolveEffort(provider, tier, effort) {
  if (effort === null) {
    return provider.nullEffort === undefined ? null : provider.efforts[provider.nullEffort];
  }
  const shifted = EFFORTS.indexOf(effort) + (provider.effortShift?.[tier] ?? 0);
  return provider.efforts[EFFORTS[Math.min(shifted, EFFORTS.length - 1)]];
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
    const inherited = kind.tier === INHERIT;
    kinds[name] = {
      model: inherited ? INHERIT : provider.tiers[kind.tier],
      effort: inherited ? null : resolveEffort(provider, kind.tier, kind.effort)
    };
  }
  return kinds;
}

function resolveCodexTwins(table, provider, name) {
  const twins = {};
  for (const [twin, entry] of Object.entries(provider.codexTwins ?? {})) {
    if (!(entry.from in table.agents)) {
      throw new Error(`provider ${name}: codexTwins ${twin} names ${entry.from}, which agents does not list`);
    }
    const kind = table.kinds[entry.kind];
    if (!kind) {
      throw new Error(`provider ${name}: codexTwins ${twin}: unknown kind ${entry.kind}`);
    }
    const tier = entry.budget === undefined ? kind.tier : table.budgets?.[entry.budget]?.[kind.tier];
    if (!tier) {
      throw new Error(`${twin}: kind ${entry.kind} is not on a tier the ${entry.budget} budget swaps`);
    }
    twins[twin] = { from: entry.from, description: entry.description, model: provider.tiers[tier], effort: resolveEffort(provider, tier, kind.effort) };
  }
  return twins;
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

export function readKindTable(path = TABLE_PATH, { provider: name } = {}) {
  const table = JSON.parse(readFileSync(path, 'utf8'));
  table.provider = name ?? table.provider;
  const provider = readProvider(table, table.provider);
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
  return { ...table, kinds, codexTwins: resolveCodexTwins(table, provider, table.provider) };
}
