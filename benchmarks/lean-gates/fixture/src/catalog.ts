import type { Cents } from './money.ts';

// The tax category decides the rate a product is taxed at in each region.
export type Category = 'standard' | 'reduced' | 'zero';

export interface Product {
  readonly sku: string;
  readonly name: string;
  readonly unitPriceCents: Cents;
  readonly category: Category;
}

export type Catalog = ReadonlyMap<string, Product>;

export function createCatalog(products: readonly Product[]): Catalog {
  const catalog = new Map<string, Product>();
  for (const product of products) {
    if (catalog.has(product.sku)) throw new Error(`duplicate SKU ${product.sku}`);
    if (!Number.isInteger(product.unitPriceCents) || product.unitPriceCents < 0) {
      throw new RangeError(`SKU ${product.sku} has an invalid price ${product.unitPriceCents}`);
    }
    catalog.set(product.sku, product);
  }
  return catalog;
}

export function findProduct(catalog: Catalog, sku: string): Product {
  const product = catalog.get(sku);
  if (product === undefined) throw new Error(`unknown SKU ${sku}`);
  return product;
}
