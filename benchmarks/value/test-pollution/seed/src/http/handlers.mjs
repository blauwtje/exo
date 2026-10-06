import { listPrice } from '../catalog/price-list.mjs';
import { generateInvoice } from '../invoices/generate.mjs';
import { creditNote } from '../invoices/credit-notes.mjs';
import { createQuote } from '../quotes/builder.mjs';
import { getQuote } from '../quotes/store.mjs';

export const handlers = {
  priceOf: (tenant, { params }) => ({ status: 200, body: { sku: params.sku, price: listPrice(tenant, params.sku) } }),
  newQuote: (tenant, { body }) => ({ status: 201, body: createQuote(tenant, body.items) }),
  showQuote: (tenant, { params }) => ({ status: 200, body: getQuote(tenant, params.id) }),
  newInvoice: (tenant, { body }) => ({ status: 201, body: generateInvoice(tenant, getQuote(tenant, body.quoteId)) }),
  newCredit: (tenant, { body }) => ({ status: 201, body: creditNote(tenant, body.invoice, { share: body.share }) }),
};
