export function summary(store, now = new Date()) {
  const open = store.list({ status: 'open' });
  const done = store.list({ status: 'done' });
  const overdue = open.filter((task) => task.dueAt !== null && new Date(task.dueAt) < now);
  return {
    total: store.count(),
    open: open.length,
    done: done.length,
    overdue: overdue.length,
  };
}
