import { TenantError } from '../util/errors.mjs';

const events = [];

export function record({ tenant, type, ref }) {
  if (!tenant) throw new TenantError('an audit event needs a tenant');
  const event = { seq: events.length + 1, tenant, type, ref };
  events.push(event);
  return event;
}

export function eventsFor(tenantId) {
  return events.filter((event) => event.tenant === tenantId);
}
