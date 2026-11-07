import { sheetRoute } from './google-sheets.mjs';

const ROUTES = [sheetRoute];

export function pageRoute(url) {
  for (const route of ROUTES) {
    const found = route(url);
    if (found) return found;
  }
  return null;
}
