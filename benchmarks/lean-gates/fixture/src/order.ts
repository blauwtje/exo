import { findProduct, type Catalog } from './catalog.ts';
import type { Discount } from './discounts.ts';
import { sumCents, type Cents } from './money.ts';
import type { Region } from './tax.ts';

export interface OrderLine {
  readonly sku: string;
  readonly quantity: number;
}

export interface Order {
  readonly id: string;
  readonly region: Region;
  // ISO-8601 calendar date, such as 2024-03-01.
  readonly placedOn: string;
  readonly lines: readonly OrderLine[];
  readonly discount?: Discount;
}

export function lineNetCents(line: OrderLine, catalog: Catalog): Cents {
  if (!Number.isInteger(line.quantity) || line.quantity < 1) {
    throw new RangeError(`SKU ${line.sku} has an invalid quantity ${line.quantity}`);
  }
  return findProduct(catalog, line.sku).unitPriceCents * line.quantity;
}

export function orderSubtotal(order: Order, catalog: Catalog): Cents {
  return sumCents(order.lines.map((line) => lineNetCents(line, catalog)));
}
