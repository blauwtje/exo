// The part of the route-skills body a long session hears again. The session hook
// injects that body once, and every tool result after it pushes the rules
// further from the turn that needs them. The text is cut out of the skill file
// by heading each time it is sent, so the rules exist once in this repository.
// Imported as `#restatement` by the hook that sends it and by the verifier
// check that locks its size, so both measure the same text.

export const RESTATED_SKILL = 'skills/route-skills/SKILL.md';
export const RESTATED_HEADINGS = ['## Before acting', '## When several fire', '# Closing'];

// Transcript growth between two restatements. This repository's own transcripts
// hold 9 to 17 bytes per context token, so this is 35,000 to 70,000 tokens.
export const RESTATE_INTERVAL_BYTES = 600_000;

const LEAD = 'exo: the routing rules from the session start, restated because this context has grown.';
const SECTION_BOUNDARY = /^#{1,2} /;

// A `# ` line inside a code fence would end a section early; the named
// sections hold no fence, and the byte lock in verify/budgets.mjs would not
// notice one, so keep fences out of them or teach this function to skip them.
function section(lines, heading) {
  const start = lines.indexOf(heading);
  if (start === -1) throw new Error(`${RESTATED_SKILL} has no "${heading}" heading`);
  let end = start + 1;
  while (end < lines.length && !SECTION_BOUNDARY.test(lines[end])) end += 1;
  return lines.slice(start, end).join('\n').trimEnd();
}

export function restatementText(skillText) {
  const lines = skillText.split(/\r?\n/);
  const sections = RESTATED_HEADINGS.map((heading) => section(lines, heading));
  return [LEAD, ...sections].join('\n\n');
}
