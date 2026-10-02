import { createCatalog, type Catalog } from '../../src/catalog.ts';

export function sampleCatalog(): Catalog {
  return createCatalog([
    { sku: 'BK-001', name: 'Field guide', unitPriceCents: 2450, category: 'reduced' },
    { sku: 'HW-010', name: 'Desk lamp', unitPriceCents: 3999, category: 'standard' },
    { sku: 'HW-022', name: 'Cable set', unitPriceCents: 1275, category: 'standard' },
    { sku: 'FD-300', name: 'Coffee beans', unitPriceCents: 1890, category: 'reduced' },
    { sku: 'GC-050', name: 'Gift card', unitPriceCents: 5000, category: 'zero' }
  ]);
}

export const SKUS = ['BK-001', 'HW-010', 'HW-022', 'FD-300', 'GC-050'] as const;
