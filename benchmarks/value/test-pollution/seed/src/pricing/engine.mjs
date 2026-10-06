import { resolveOptions } from '../config/options.mjs';
import { findProduct } from '../catalog/products.mjs';
import { listPrice } from '../catalog/price-list.mjs';
import { ValidationError } from '../util/errors.mjs';
import { sumCents } from '../util/money.mjs';
import { volumeRate } from './discounts.mjs';
import { roundCents, useRounding } from './rounding.mjs';
import { taxRate } from './tax.mjs';

export function priceLine(tenant, options, { sku, quantity }) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new ValidationError(`quantity for ${sku} must be a positive integer`);
  }
  const product = findProduct(sku);
  const unit = listPrice(tenant, sku);
  const gross = unit * quantity;
  const net = roundCents((gross * (10000 - volumeRate(tenant, quantity))) / 10000);
  const rate = taxRate(tenant, product.category);
  const inclusive = options.taxMode === 'inclusive';
  const tax = inclusive
    ? roundCents(net - (net * 10000) / (10000 + rate))
    : roundCents((net * rate) / 10000);
  return { sku, quantity, unit, discount: gross - net, net, tax, total: inclusive ? net : net + tax };
}

export function priceCart(tenant, items) {
  const options = resolveOptions(tenant);
  if (items.length === 0) throw new ValidationError('the cart is empty');
  if (items.length > options.maxLines) {
    throw new ValidationError(`a cart holds at most ${options.maxLines} lines`);
  }
  useRounding(tenant.rounding);
  const lines = items.map((item) => priceLine(tenant, options, item));
  const total = sumCents(lines.map((line) => line.total));
  if (total < options.minOrderCents) throw new ValidationError('the order is below the minimum');
  return {
    tenant: tenant.id,
    currency: tenant.currency,
    lines,
    subtotal: sumCents(lines.map((line) => line.net)),
    tax: sumCents(lines.map((line) => line.tax)),
    total,
  };
}
