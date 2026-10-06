import { TaskStore } from '../src/store.js';

export const NOW = '2026-03-01T10:00:00.000Z';

// Three tasks: 1 work (overdue), 2 home and errand, 3 home (overdue).
export function sampleStore() {
  const store = new TaskStore({ now: () => NOW });
  store.create({ title: 'write report', tags: ['work'], dueAt: '2026-02-27T09:00:00.000Z' });
  store.create({ title: 'buy milk', tags: ['home', 'errand'] });
  store.create({ title: 'call plumber', tags: ['home'], dueAt: '2026-02-20T09:00:00.000Z' });
  return store;
}
