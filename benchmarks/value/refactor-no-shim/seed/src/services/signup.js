import { UserRecord } from '../models/index.js';

export function signup(store, { email, name, plan = 'free' }) {
  if (!store.plans.has(plan)) throw new Error(`unknown plan: ${plan}`);
  const member = new UserRecord({ id: store.nextId(), email, name, plan });
  if (store.hasEmail(member.email)) throw new Error(`email already registered: ${member.email}`);
  store.add(member);
  return member;
}
