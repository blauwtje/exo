import { listItems } from './items.js';

function cell(value) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function exportCsv(db) {
  const lines = ['sku,name,qty,reorder_at'];
  for (const item of listItems(db)) {
    lines.push([item.sku, item.name, item.qty, item.reorderAt].map(cell).join(','));
  }
  return lines.join('\n') + '\n';
}
