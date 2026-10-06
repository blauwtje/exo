// Open tasks whose due date has passed, oldest due date first.
export function dueReminders(store, now = new Date()) {
  return store
    .list({ status: 'open' })
    .filter((task) => task.dueAt !== null && new Date(task.dueAt) <= now)
    .map(({ id, title, dueAt }) => ({ id, title, dueAt }))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id - b.id);
}
