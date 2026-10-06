const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatCents(cents) {
  return money.format(cents / 100);
}

export function pageFooter({ page, totalPages }) {
  return `Page ${page} of ${totalPages}`;
}
