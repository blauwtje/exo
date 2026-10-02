import { findProduct, type Catalog } from './catalog.ts';
import { discountCents } from './discounts.ts';
import { formatCents, sumCents, type Cents } from './money.ts';
import { lineNetCents, orderSubtotal, type Order } from './order.ts';
import { computeTax } from './tax.ts';

export interface InvoiceLine {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly netCents: Cents;
  readonly discountCents: Cents;
  readonly taxCents: Cents;
}

export interface Invoice {
  readonly orderId: string;
  readonly issuedOn: string;
  readonly lines: readonly InvoiceLine[];
  readonly subtotalCents: Cents;
  readonly discountCents: Cents;
  readonly taxCents: Cents;
  readonly totalCents: Cents;
}

// Each line's share of the order discount, in proportion to its net amount:
// floored shares, then the cents left over one each from the first line on.
function discountShares(nets: readonly Cents[], discount: Cents): Cents[] {
  const subtotal = sumCents(nets);
  if (subtotal === 0) return nets.map(() => 0);
  const shares = nets.map((net) => Math.floor((net * discount) / subtotal));
  let left = discount - sumCents(shares);
  for (let index = 0; left > 0; index = (index + 1) % shares.length) {
    if (nets[index] === 0) continue;
    shares[index] = (shares[index] ?? 0) + 1;
    left -= 1;
  }
  return shares;
}

// Tax is charged per line on the line's net after its share of the discount.
export function buildInvoice(order: Order, catalog: Catalog): Invoice {
  const subtotal = orderSubtotal(order, catalog);
  const discount = discountCents(subtotal, order.discount);
  const nets = order.lines.map((line) => lineNetCents(line, catalog));
  const shares = discountShares(nets, discount);
  const lines = order.lines.map((line, index): InvoiceLine => {
    const product = findProduct(catalog, line.sku);
    const net = nets[index] ?? 0;
    const share = shares[index] ?? 0;
    return {
      sku: line.sku,
      name: product.name,
      quantity: line.quantity,
      netCents: net,
      discountCents: share,
      taxCents: computeTax(net - share, order.region, product.category)
    };
  });
  const tax = sumCents(lines.map((line) => line.taxCents));
  return {
    orderId: order.id,
    issuedOn: order.placedOn,
    lines,
    subtotalCents: subtotal,
    discountCents: discount,
    taxCents: tax,
    totalCents: subtotal - discount + tax
  };
}

export function renderInvoice(invoice: Invoice): string {
  const rows = invoice.lines.map((line) => `${line.quantity} x ${line.name} (${line.sku})  ${formatCents(line.netCents)}`);
  return [
    `Invoice for order ${invoice.orderId}, issued ${invoice.issuedOn}`,
    ...rows,
    `Subtotal  ${formatCents(invoice.subtotalCents)}`,
    `Discount  ${formatCents(-invoice.discountCents)}`,
    `Tax       ${formatCents(invoice.taxCents)}`,
    `Total     ${formatCents(invoice.totalCents)}`
  ].join('\n');
}
