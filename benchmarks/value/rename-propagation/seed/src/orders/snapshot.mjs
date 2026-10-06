// Order lines are purchase-time snapshots: what the customer saw when they
// paid, kept as it was. Nothing rewrites a line after the order exists; the
// lines are frozen here so a later change to the catalogue cannot reach them.
// See docs/orders.md.
export function snapshotLines(lines) {
  return Object.freeze(lines.map(({ productId, name, unitPrice, qty }) => Object.freeze({ productId, name, unitPrice, qty })));
}
