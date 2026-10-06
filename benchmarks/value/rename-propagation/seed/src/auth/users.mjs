import { forbidden, unauthenticated } from '../http/errors.mjs';

export function createUsers(records) {
  const byId = new Map(records.map((user) => [user.id, user]));
  return {
    get: (id) => byId.get(id) ?? null,
    fromHeaders: (headers) => byId.get(headers['x-user']) ?? null,
  };
}

export function requireUser(req) {
  if (!req.user) throw unauthenticated();
  return req.user;
}

export function requireAdmin(req) {
  const user = requireUser(req);
  if (user.role !== 'admin') throw forbidden();
  return user;
}
