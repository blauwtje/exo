import { NO_RUN, SAFE_TASKS } from './tasks.mjs';

const BUILD_TIMEOUT_MS = 20 * 60 * 1000;

const GRID_SETTINGS = [
  { model: 'sonnet', effort: 'low' },
  { model: 'opus', effort: 'high' },
  { model: 'fable', effort: 'low' },
  { model: 'fable', effort: 'xhigh' }
];

function buildCell(task, { id, model, effort, set }) {
  return {
    id,
    kind: 'build',
    set,
    task,
    variant: null,
    source: null,
    model,
    effort,
    prompt: task.prompt,
    appendSystemPrompt: NO_RUN,
    disallowedTools: ['Bash'],
    budgetUsd: '3',
    timeoutMs: BUILD_TIMEOUT_MS
  };
}

export function buildCells(models) {
  return SAFE_TASKS.map((task) => buildCell(task, { id: `build-${task.id}`, model: models.sonnet, effort: 'high', set: 'build' }));
}

export function buildGridCells(models) {
  return SAFE_TASKS.flatMap((task) => GRID_SETTINGS.map(({ model, effort }) => buildCell(task, {
    id: `build-grid-${task.id}-${model}-${effort}`,
    model: models[model],
    effort,
    set: 'build-grid'
  })));
}
