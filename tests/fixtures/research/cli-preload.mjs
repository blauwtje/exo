import fs from 'node:fs';
import { registerHooks } from 'node:module';

const stub = JSON.parse(fs.readFileSync(process.env.EXO_FETCH_STUB, 'utf8'));
const fakePlaywright = new URL('./fake-playwright.mjs', import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'playwright') return { url: fakePlaywright, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

globalThis.fetch = async (url) => {
  fs.appendFileSync(stub.log, `${JSON.stringify({ url: String(url), at: Date.now() })}\n`);
  const hit = stub.routes.find(([match]) => String(url).includes(match));
  if (!hit) return new Response('missing', { status: 404 });
  const [, status, body, headers = { 'content-type': 'text/html' }] = hit;
  return new Response(body, { status, headers });
};
