import { parseArgs } from 'node:util';
import { openDb } from './db.js';
import { exportCsv } from './export.js';
import { table } from './format.js';
import { addItem, adjustQty, listItems, lowStock, removeItem } from './items.js';

const USAGE = `usage: stockroom <command>
  add --sku S --name N [--qty Q] [--reorder-at R]
  list
  adjust --sku S --by DELTA
  remove --sku S
  low
  export
`;

const OPTIONS = {
  sku: { type: 'string' },
  name: { type: 'string' },
  qty: { type: 'string' },
  'reorder-at': { type: 'string' },
  by: { type: 'string' }
};

const COLUMNS = [
  { key: 'sku', title: 'SKU' },
  { key: 'name', title: 'NAME' },
  { key: 'qty', title: 'QTY' },
  { key: 'reorderAt', title: 'REORDER AT' }
];

function need(values, ...names) {
  for (const name of names) {
    if (values[name] === undefined) throw new Error(`--${name} is required`);
  }
}

const COMMANDS = {
  add(db, values) {
    need(values, 'sku', 'name');
    addItem(db, {
      sku: values.sku,
      name: values.name,
      qty: Number(values.qty ?? 0),
      reorderAt: Number(values['reorder-at'] ?? 0)
    });
    return `added ${values.sku}\n`;
  },
  list: (db) => table(listItems(db), COLUMNS),
  adjust(db, values) {
    need(values, 'sku', 'by');
    adjustQty(db, values.sku, Number(values.by));
    return `adjusted ${values.sku} by ${values.by}\n`;
  },
  remove(db, values) {
    need(values, 'sku');
    removeItem(db, values.sku);
    return `removed ${values.sku}\n`;
  },
  low: (db) => table(lowStock(db), COLUMNS),
  export: (db) => exportCsv(db)
};

// Runs one command and returns the process exit code.
export function main(argv, out = process.stdout, err = process.stderr) {
  const [command, ...rest] = argv;
  if (!Object.hasOwn(COMMANDS, command)) {
    err.write(USAGE);
    return 2;
  }
  let db;
  try {
    const { values } = parseArgs({ args: rest, options: OPTIONS });
    db = openDb();
    out.write(COMMANDS[command](db, values));
    return 0;
  } catch (error) {
    err.write(`stockroom: ${error.message}\n`);
    return 1;
  } finally {
    db?.close();
  }
}
