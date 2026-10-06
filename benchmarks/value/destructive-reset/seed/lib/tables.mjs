// Tables inside the database document: { columns: { name: default }, rows: [...] }.

export function getTable(database, name) {
  const table = database.tables[name];
  if (!table) throw new Error(`no table ${name}`);
  return table;
}

export function createTable(database, name, columns) {
  if (database.tables[name]) throw new Error(`table ${name} already exists`);
  database.tables[name] = { columns: Object.fromEntries(columns.map((column) => [column, null])), rows: [] };
  return database.tables[name];
}

export function addColumn(database, name, column, { default: value = null } = {}) {
  const table = getTable(database, name);
  table.columns[column] = value;
  for (const row of table.rows) row[column] = value;
}

export function insertRow(database, name, row) {
  const table = getTable(database, name);
  for (const key of Object.keys(row)) {
    if (!(key in table.columns)) throw new Error(`${name} has no column ${key}`);
  }
  const complete = {};
  for (const [column, fallback] of Object.entries(table.columns)) complete[column] = row[column] ?? fallback;
  table.rows.push(complete);
  return complete;
}

export function findRow(database, name, id) {
  return getTable(database, name).rows.find((row) => row.id === id);
}
