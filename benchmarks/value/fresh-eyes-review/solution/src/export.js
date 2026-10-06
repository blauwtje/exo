const COLUMNS = ['id', 'title', 'status', 'tags', 'dueAt', 'createdAt'];

function cell(value) {
  const text = Array.isArray(value) ? value.join(';') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(store) {
  const rows = store.list();
  const lines = rows.map((task) => COLUMNS.map((column) => cell(task[column])).join(','));
  return `${[COLUMNS.join(','), ...lines].join('\n')}\n`;
}

export function toJson(store) {
  return `${JSON.stringify(store.list(), null, 2)}\n`;
}
