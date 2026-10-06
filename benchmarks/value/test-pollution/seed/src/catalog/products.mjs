import { NotFoundError } from '../util/errors.mjs';

export const PRODUCTS = [
  { sku: 'WIDGET-1', name: 'Widget', category: 'hardware', basePrice: 1000 },
  { sku: 'WIDGET-2', name: 'Widget XL', category: 'hardware', basePrice: 1850 },
  { sku: 'GADGET-1', name: 'Gadget', category: 'hardware', basePrice: 2500 },
  { sku: 'GADGET-2', name: 'Gadget Pro', category: 'hardware', basePrice: 4000 },
  { sku: 'CABLE-1', name: 'Cable 1 m', category: 'accessory', basePrice: 350 },
  { sku: 'CABLE-2', name: 'Cable 2 m', category: 'accessory', basePrice: 475 },
  { sku: 'SERVICE-1', name: 'Installation', category: 'service', basePrice: 9900 },
  { sku: 'LICENSE-1', name: 'Annual license', category: 'digital', basePrice: 12000 },
];

const BY_SKU = new Map(PRODUCTS.map((product) => [product.sku, product]));

export function findProduct(sku) {
  const product = BY_SKU.get(sku);
  if (!product) throw new NotFoundError(`unknown sku "${sku}"`);
  return product;
}
