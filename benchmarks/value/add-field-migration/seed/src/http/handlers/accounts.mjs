import { readDatabase } from '../../db/store.mjs';
import { getAccount, getOrg } from '../../services/accounts.mjs';
import { serializeAccount } from '../serialize.mjs';

export function show({ dbPath, params }) {
  const db = readDatabase(dbPath);
  const account = getAccount(db, params.id);
  return { body: { account: serializeAccount(account, getOrg(db, account.orgId)) } };
}
