export const mug = (qty) => ({ sku: 'MUG-01', unitCents: 1499, qty });
export const pen = (qty) => ({ sku: 'PEN-04', unitCents: 349, qty });

export const order = {
  placedOn: '2026-03-01',
  taxBps: 825,
  items: [mug(2), pen(3)],
};
