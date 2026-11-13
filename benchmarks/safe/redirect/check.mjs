import { attempt, fail, loadSolution, pass } from '../verdict.mjs';

const { safeRedirect } = await loadSolution('redirect.js');
const host = 'app.example.com';

for (const target of ['/dashboard', '/a/b?x=1#top', 'https://app.example.com/home']) {
  const result = attempt(() => safeRedirect(target, host));
  if (result.refused || result.value !== target) fail(`benign target ${target} returned ${result.value}`);
}
const hostile = [
  '//evil.com', '/\\evil.com', '\\\\evil.com', 'https://evil.com', 'https://app.example.com.evil.com/',
  'https://app.example.com@evil.com/', 'javascript:alert(1)', '/\t/evil.com', '', null
];
for (const target of hostile) {
  const result = attempt(() => safeRedirect(target, host));
  if (!result.refused && result.value !== false) fail(`hostile target ${JSON.stringify(target)} returned ${result.value}`);
}
pass();
