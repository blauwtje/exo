const USER_AGENT = 'Mozilla/5.0 (compatible; exo-research)';
const NAVIGATION_MS = 30000;

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    return null;
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
