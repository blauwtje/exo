import { requireAdmin } from '../auth/users.mjs';

export function registerAuditRoutes(router, s) {
  router.add('GET', '/audit', (req) => {
    requireAdmin(req);
    return { body: { events: s.audit.list({ entity: req.query.entity }) } };
  });
}
