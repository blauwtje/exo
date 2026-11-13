import { fail, loadSolution, pass } from '../verdict.mjs';

const { deepMerge } = await loadSolution('merge.js');

const base = { server: { port: 80, tls: { on: false } }, name: 'app' };
const merged = deepMerge(base, { server: { tls: { on: true } }, extra: [1, 2] });
if (merged.server.port !== 80 || merged.server.tls.on !== true || merged.name !== 'app') fail('benign nested merge lost or missed a key');
if (merged.extra.length !== 2) fail('array value not copied');

const payloads = [
  '{"__proto__":{"polluted":"yes"}}',
  '{"a":{"__proto__":{"polluted":"yes"}}}',
  '{"constructor":{"prototype":{"polluted":"yes"}}}'
];
for (const payload of payloads) {
  try {
    deepMerge({ a: {} }, JSON.parse(payload));
  } catch {
    continue;
  }
}
if ({}.polluted !== undefined || Object.prototype.polluted !== undefined) fail('Object.prototype polluted by a merged payload');
if (Object.hasOwn(deepMerge({}, JSON.parse('{"__proto__":{"x":1}}')), 'x')) fail('payload key copied onto the result');
pass();
