import { readFileSync } from 'node:fs';

export const TABLE_PATH = new URL('./model-kinds.json', import.meta.url);
export const TIERS = ['strong', 'standard', 'fast'];
export const INHERIT = 'inherit';
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const BUDGETS = ['fast', 'balanced', 'quality'];

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

function checkCell(name, cell) {
  if (cell.tier !== INHERIT && !TIERS.includes(cell.tier)) {
    throw new Error(`kind ${name}: unknown tier ${cell.tier}`);
  }
  if (cell.effort !== null && !EFFORTS.includes(cell.effort)) {
    throw new Error(`kind ${name}: unknown effort ${cell.effort}`);
  }
}

function checkColumns(name, columns) {
  for (const column of BUDGETS) {
    if (!columns[column]) {
      throw new Error(`kind ${name}: no ${column} column`);
    }
    checkCell(name, columns[column]);
  }
}

function resolveKinds(table, provider, budget) {
  const kinds = {};
  for (const [name, columns] of Object.entries(table.kinds)) {
    checkColumns(name, columns);
    const kind = columns[budget];
    const inherited = kind.tier === INHERIT;
    kinds[name] = {
      model: inherited ? INHERIT : provider.tiers[kind.tier],
      effort: inherited && kind.effort === null ? null : resolveEffort(provider, kind.tier, kind.effort)
    };
  }
  return kinds;
}

export function readKindTable(path = TABLE_PATH, { provider: name, budget = 'balanced' } = {}) {
  if (!BUDGETS.includes(budget)) {
    throw new Error(`unknown budget ${budget}`);
  }
  const table = JSON.parse(readFileSync(path, 'utf8'));
  table.provider = name ?? table.provider;
  const provider = readProvider(table, table.provider);
  const kinds = resolveKinds(table, provider, budget);
  const members = [
    ...Object.entries(table.agents),
    ...(table.unnamed ? [['unnamed', table.unnamed]] : []),
    ...Object.entries(table.stages).map(([stage, entry]) => [`stage ${stage}`, entry]),
    ...table.dispatches.map((dispatch) => [dispatch.file, dispatch])
  ];
  for (const [file, member] of members) {
    if (!(member.kind in kinds)) {
      throw new Error(`${file}: unknown kind ${member.kind}`);
    }
  }
  return { ...table, kinds };
}
