export const description = 'bookkeeping counters';

export function up(db) {
  db.meta.sequences = { invoice: 0, account: 0 };
}
