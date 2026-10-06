export const description = 'the organisation accounts belong to until told otherwise';

export function up(db) {
  if (db.orgs.some((org) => org.id === 'org_default')) return;
  db.orgs.push({
    id: 'org_default',
    name: 'Ledgerline Demo Organisation',
    defaultCurrency: 'EUR',
    timezone: 'Europe/Amsterdam',
  });
}
