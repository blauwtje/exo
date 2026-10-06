import path from 'node:path';

export const DEFAULT_DB_FILE = 'data/invoicing.json';
export const PAYMENT_TERMS_DAYS = 30;
export const DEFAULT_PORT = 4100;

export function resolveDbPath(flag) {
  return path.resolve(flag ?? process.env.INVOICING_DB ?? DEFAULT_DB_FILE);
}
