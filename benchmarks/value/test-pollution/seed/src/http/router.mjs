import { getTenant } from '../tenants/registry.mjs';
import { NotFoundError, TenantError } from '../util/errors.mjs';
import { handlers } from './handlers.mjs';

const ROUTES = [
  ['GET', /^\/prices\/([^/]+)$/, ['sku'], handlers.priceOf],
  ['POST', /^\/quotes$/, [], handlers.newQuote],
  ['GET', /^\/quotes\/([^/]+)$/, ['id'], handlers.showQuote],
  ['POST', /^\/invoices$/, [], handlers.newInvoice],
  ['POST', /^\/credit-notes$/, [], handlers.newCredit],
];

export function handle({ method, path, headers = {}, body = {} }) {
  try {
    const tenantId = headers['x-tenant'];
    if (!tenantId) throw new TenantError('the x-tenant header is required');
    const tenant = getTenant(tenantId);
    for (const [verb, pattern, names, handler] of ROUTES) {
      const match = verb === method ? pattern.exec(path) : null;
      if (!match) continue;
      const params = Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1])]));
      return handler(tenant, { params, body });
    }
    throw new NotFoundError(`no route for ${method} ${path}`);
  } catch (error) {
    if (error.status) return { status: error.status, body: { error: error.message } };
    throw error;
  }
}
