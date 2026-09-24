// The chat layout for one shaping round or checkpoint, drawn from the same
// checked decision map the question page renders. Text only: no HTML, no
// import from question-page.mjs, so the two stay free of a cycle. The caller
// passes a map already checked (see question-page.mjs's checkedMap), with its
// words merged from DEFAULT_WORDS, TEXT_WORDS and the map's own overrides.

// The words this layout needs beyond DEFAULT_WORDS: the overview line's two
// forms, the answer hint, the closer names as they read in a sentence rather
// than a button, and the checkpoint's two options.
export const TEXT_WORDS = {
  overviewAsked: 'round {r}',
  overviewWaits: 'waits on {name}',
  answerHint: 'Answer like `4.1 5.2`, `ok` for every recommended answer, or `go` for the recommended answer to everything still open.',
  closedByYou: 'you',
  closedByCode: 'code',
  closedByExo: 'exo',
  checkpointWrite: 'Write the spec (Recommended)',
  checkpointWriteGives: 'exo writes the brief from these decisions.',
  checkpointChange: 'Change something',
  checkpointChangeGives: 'the questions you name return as the next round.'
};

function fill(template, values) {
  return template.replace(/\{(\w+)\}/g, (placeholder, key) => String(values[key] ?? placeholder));
}

const hasNumber = (decision) => decision.number !== undefined;
// Mirrors question-page.mjs's own isAsked; round-text.mjs cannot import it
// (question-page.mjs imports this module, so the reverse import would cycle).
const isAsked = (decision, round) => decision.state === 'open' && hasNumber(decision) && (decision.round === undefined || decision.round === round);
const byNumber = (left, right) => (left.number ?? 0) - (right.number ?? 0);

function recommendedFirst(options) {
  return [...options].sort((left, right) => Number(Boolean(right.recommended)) - Number(Boolean(left.recommended)));
}

/** One overview line: the decision it waits on when it has one, because its
 *  options are unknown until that answer, else the round it is asked in. */
function overviewLine(decision, decisions, words) {
  if (decision.waitsOn !== undefined) {
    const parent = decisions.find((other) => other.id === decision.waitsOn);
    return `- ${decision.name}: ${fill(words.overviewWaits, { name: parent.name })}`;
  }
  return `- ${decision.name}: ${fill(words.overviewAsked, { r: decision.round ?? 1 })}`;
}

/** The tree of open decisions, above the first round only, so a reader who
 *  has not seen the map yet knows what is coming and what is blocking it. */
function overview(checked) {
  const open = checked.decisions.filter((decision) => decision.state !== 'closed');
  return open.map((decision) => overviewLine(decision, checked.decisions, checked.words)).join('\n');
}

function optionLine(option, place, words) {
  const badge = option.recommended ? ` (${words.recommended})` : '';
  return `${place}. **${option.label}${badge}**: ${option.gives}`;
}

function questionCard(decision, words) {
  const heading = `**${fill(words.question, { n: decision.number })} · ${decision.name}**`;
  const options = recommendedFirst(decision.options).map((option, index) => optionLine(option, index + 1, words));
  return [
    heading,
    decision.question,
    `${words.changes}: ${decision.changes}`,
    '',
    options.join('\n'),
    '',
    `${words.why}: ${decision.why}`
  ].join('\n');
}

/** A round: the overview above round 1, the round line, each ready question
 *  as a card separated by a rule, then the answer hint. */
function round(checked, asked) {
  const { words } = checked;
  const stillOpen = checked.decisions.filter((decision) => decision.state !== 'closed').length;
  const lines = [];
  if (checked.round === 1) {
    const overviewText = overview(checked);
    if (overviewText) lines.push(overviewText, '');
  }
  lines.push(fill(words.round, { r: checked.round, k: stillOpen }), '');
  lines.push(asked.map((decision) => questionCard(decision, words)).join('\n\n---\n\n'));
  lines.push('', words.answerHint);
  return lines.join('\n');
}

function closerText(decision, words) {
  if (decision.closedBy === 'code') return `${words.closedByCode}: ${decision.evidence}`;
  return decision.closedBy === 'you' ? words.closedByYou : words.closedByExo;
}

function checkpointLine(decision, words) {
  const number = hasNumber(decision) ? `${fill(words.question, { n: decision.number })} · ` : '';
  return `${number}${decision.name}: ${decision.answer} (${closerText(decision, words)})`;
}

/** The checkpoint: every closed decision on one line, numbered when it was
 *  asked and bare when the code settled it, then the write-or-change choice. */
function checkpoint(checked) {
  const { words } = checked;
  const closed = checked.decisions.filter((decision) => decision.state === 'closed');
  const numbered = closed.filter(hasNumber).sort(byNumber);
  const unnumbered = closed.filter((decision) => !hasNumber(decision));
  const lines = [...numbered, ...unnumbered].map((decision) => checkpointLine(decision, words));
  lines.push(
    '',
    `1. **${words.checkpointWrite}**: ${words.checkpointWriteGives}`,
    `2. **${words.checkpointChange}**: ${words.checkpointChangeGives}`
  );
  return lines.join('\n');
}

/** The chat layout for one round: `## A round` of SKILL.md while a decision
 *  is still asked, `## Checkpoint` once the map holds none. */
export function renderText(checked) {
  const asked = checked.decisions.filter((decision) => isAsked(decision, checked.round)).sort(byNumber);
  return asked.length === 0 ? checkpoint(checked) : round(checked, asked);
}
