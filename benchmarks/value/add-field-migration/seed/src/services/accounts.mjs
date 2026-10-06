import { currencyOf } from '../models/account.mjs';
import { notFound } from '../util/errors.mjs';

export function getOrg(db, id) {
  const org = db.orgs.find((candidate) => candidate.id === id);
  if (!org) throw notFound('organisation', id);
  return org;
}

export function getAccount(db, id) {
  const account = db.accounts.find((candidate) => candidate.id === id);
  if (!account) throw notFound('account', id);
  return account;
}

export function accountCurrency(db, accountId) {
  const account = getAccount(db, accountId);
  return currencyOf(account, getOrg(db, account.orgId));
}
