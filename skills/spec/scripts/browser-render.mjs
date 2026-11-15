import { USER_AGENT } from './sources/http.mjs';

const NAVIGATION_MS = 30000;

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND') return null;
    throw error;
  }
}

export async function renderWithBrowser(url) {
  const playwright = await loadPlaywright();
  if (!playwright) return null;
  const browser = await playwright.chromium.launch();
  try {
    const page = await browser.newPage({ userAgent: USER_AGENT });
    await page.goto(url, { timeout: NAVIGATION_MS, waitUntil: 'networkidle' });
    return await page.content();
  } finally {
    await browser.close();
  }
}
