# tenant-pricing

Pricing, quoting and invoicing for several merchants ("tenants") served from one process. Every
public function takes the tenant it acts for; tenants are registered once at start-up.

## Layout

| Path | What it holds |
|---|---|
| `src/config/` | Option defaults, option resolution and regional tax rates |
| `src/tenants/` | The tenant registry |
| `src/catalog/` | The product catalog and per-tenant price lists |
| `src/pricing/` | Line and cart pricing, volume discounts, tax and rounding |
| `src/fx/` | Currency rates and conversion |
| `src/quotes/` | Quote creation and storage |
| `src/invoices/` | Invoice numbering, invoices and credit notes |
| `src/audit/` | The audit trail |
| `src/http/` | An in-process router and its handlers; the tenant comes from the `x-tenant` header |
| `tests/` | One test file per module area |

## Tenants

A tenant has an `id`, a `currency`, a tax `region`, a `rounding` mode (`half-up`, `half-even`,
`floor` or `ceil`), an optional `priceList` of per-SKU prices in minor units, optional
`volumeTiers`, `taxOverrides` by product category and `options` that replace the defaults in
`src/config/defaults.mjs`.

## Tests

`npm test` runs every test file in one process with `node --test --test-isolation=none`, which
keeps the run fast. Prices are integers in minor units (cents).
