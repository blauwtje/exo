import { NotFoundError, TenantError } from '../util/errors.mjs';

const tenants = new Map();

const TENANT_DEFAULTS = {
  currency: 'USD',
  region: 'US',
  rounding: 'half-up',
  priceList: {},
  volumeTiers: null,
  taxOverrides: {},
  options: {},
};

export function registerTenant(config) {
  if (!config?.id) throw new TenantError('a tenant needs an id');
  const tenant = Object.freeze({ ...TENANT_DEFAULTS, ...config });
  tenants.set(tenant.id, tenant);
  return tenant;
}

export function getTenant(id) {
  const tenant = tenants.get(id);
  if (!tenant) throw new NotFoundError(`unknown tenant "${id}"`);
  return tenant;
}

export function listTenants() {
  return [...tenants.values()];
}

export function removeTenant(id) {
  return tenants.delete(id);
}
