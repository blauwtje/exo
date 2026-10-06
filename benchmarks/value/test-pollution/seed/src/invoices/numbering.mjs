const counters = new Map();

export function nextInvoiceNumber(tenant) {
  const next = (counters.get(tenant.id) ?? 0) + 1;
  counters.set(tenant.id, next);
  return `${tenant.id.toUpperCase()}-${String(next).padStart(4, '0')}`;
}
