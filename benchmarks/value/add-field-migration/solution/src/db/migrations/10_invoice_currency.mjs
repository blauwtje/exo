import { currencyOf } from '../../models/account.mjs';

export const description = 'every invoice carries the currency of its account';

export function up(db) {
  const orgs = new Map(db.orgs.map((org) => [org.id, org]));
  const accounts = new Map(db.accounts.map((account) => [account.id, account]));
  for (const invoice of db.invoices) {
    if (invoice.currency) continue;
    const account = accounts.get(invoice.accountId);
    invoice.currency = currencyOf(account, orgs.get(account.orgId));
  }
}
