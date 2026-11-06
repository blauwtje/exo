import fs from 'node:fs';
import path from 'node:path';
import { INHERIT, readKindTable, TABLE_PATH } from '#model-kinds';
import { contextLimit, softLimit } from '#context-limits';
import { settingOrDefault } from '#settings-store';
import { configDir, loadRunConfig, readKeys, resolveProvider } from './run-config.mjs';
import { sandboxMode } from './run-session-sandbox.mjs';
import { Refusal } from './run-plan-errors.mjs';

function listedProvider(name) {
  const { providers } = JSON.parse(fs.readFileSync(TABLE_PATH, 'utf8'));
  return Object.hasOwn(providers, name);
}

export const hasPin = (pin) => pin.model !== undefined || pin.effort !== undefined;

export function budgetPin(name, flags, { kind = 'build-task', retry = false, budget = settingOrDefault('budget').value } = {}) {
  if (flags.model !== undefined || flags.effort !== undefined) return {};
  if (!listedProvider(name)) return {};
  if (budget === 'off') return { model: null, effort: null };
  const { model, effort } = readKindTable(undefined, { provider: name, budget, retry }).kinds[kind];
  if (name !== 'claude') return { effort };
  return { model: model === INHERIT ? null : model, effort };
}

// why: a task that edits only prose needs no build-task tier; code, skill, agent, rule, hook and CLAUDE.md files keep it.
const DOC_EXCLUDED = /^(skills|agents|rules|hooks)\//;
export const isDocTask = (task) => task.files.length > 0 && task.files.every(({ path: file }) => file.endsWith('.md') && !DOC_EXCLUDED.test(file) && path.basename(file) !== 'CLAUDE.md');

export function chooseProvider(flags, home, project) {
  let config;
  try {
    config = loadRunConfig({ home });
  } catch (error) {
    throw new Refusal(`${path.join(configDir(home), 'run.json')} does not load: ${error.message}`);
  }
  const name = flags.provider ?? config.defaults.provider;
  const asked = flags.effort ?? config.providers[name]?.effort ?? config.defaults.effort;
  if (!config.efforts.includes(asked)) throw new Refusal(`unknown effort "${asked}"; use one of ${config.efforts.join(', ')}`);
  const provider = resolveProvider(config, name, readKeys(path.join(configDir(home), 'keys.env')), asked, home);
  if (provider.refused !== undefined) throw new Refusal(provider.refused);
  if (!Number.isInteger(config.defaults.attemptCap) || config.defaults.attemptCap < 1) throw new Refusal(`run.json defaults.attemptCap must be a positive integer, got ${JSON.stringify(config.defaults.attemptCap)}`);
  return {
    ...provider,
    asked,
    explicitEffort: flags.effort !== undefined,
    model: flags.model ?? provider.model,
    ...budgetPin(name, flags),
    docPin: budgetPin(name, flags, { kind: 'doc-task' }),
    retryPin: budgetPin(name, flags, { retry: true }),
    docRetryPin: budgetPin(name, flags, { kind: 'doc-task', retry: true }),
    shown: Object.entries(provider.env).map(([variable, value]) => [variable, String(config.providers[name].env[variable]).includes('${') ? '<from keys.env>' : value]),
    contextBudget: softLimit(contextLimit(home)),
    cacheWriteBar: config.defaults.turnOneCacheWriteWarn,
    attemptCap: config.defaults.attemptCap,
    sandbox: sandboxMode(config, project)
  };
}
