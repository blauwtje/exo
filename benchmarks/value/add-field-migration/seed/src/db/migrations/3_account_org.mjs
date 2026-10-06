export const description = 'every account belongs to an organisation';

export function up(db) {
  for (const account of db.accounts) {
    account.orgId ??= 'org_default';
  }
}
