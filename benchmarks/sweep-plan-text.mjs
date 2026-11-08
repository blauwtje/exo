export function exportedNames(helpers) {
  const names = helpers.map((helper) => `\`${helper.title.replace('Add ', '')}\``);
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

export function planScopeSection(helpers) {
  const helperTests = helpers.map((helper) => helper.test).join(' ');
  return [
    '## Success criterion',
    '',
    `\`node --test ${helperTests}\` passes.`,
    '',
    '## Non-goals',
    '',
    '- `src/words.js` and its test stay unchanged.',
    '- No dependency is added.',
    ''
  ];
}

const COUNT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

function countWord(count) {
  return COUNT_WORDS[count] ?? String(count);
}

export function planContextSection(helpers) {
  return [
    '## Context',
    '',
    '- Every module is an ES module with one named export; its test sits beside it and uses `node:test` and `node:assert/strict`, as `src/words.test.js` does.',
    `- The ${countWord(helpers.length)} tasks are independent: no module imports another.`,
    '',
    '## Checkpoint',
    '',
    '- Blocks first: none.',
    '- Parallel: every task.',
    '- Shared state: none.',
    '- Smallest safe split: one task per helper, each with its own module and test.',
    ''
  ];
}

export function planClosingSection() {
  return [
    '## Final verification',
    '',
    '- `npm test`: every test passes, `fail 0`.',
    '- Walkthrough: none, the library has no user-visible surface.',
    ''
  ];
}
