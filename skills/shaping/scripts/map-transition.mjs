// The pure transitions of a shaping decision map: adding decisions, applying
// one round's answer, and moving to the next round's picks. Each function
// takes the raw map object and returns { map, lines }, a new map and the
// stdout lines the caller (question-page.mjs) prints; none of them read or
// write a file, and none of them import question-page.mjs, so the two stay
// one-directional: question-page.mjs may depend on this module, never the
// reverse. Validation of the map's shape is question-page.mjs's checkedMap,
// run before and after these transitions; this module only guards the fields
// specific to an --add or --apply call, exiting through UsageError.

import { UsageError } from '#script-flags';

// A round asks at most this many ready decisions (SKILL.md, "Ask in
// rounds"), mirrored from question-page.mjs's own ROUND_MAX: this module
// cannot import that one without creating the cycle the header describes.
export const ROUND_MAX = 4;

const MERGEABLE_FIELDS = ['question', 'changes', 'why', 'options', 'name', 'waitsOn'];

function requireNonEmptyString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new UsageError(`${field} must be a non-empty string`);
  }
  return value;
}

function recommendedFirst(options) {
  return [...options].sort((left, right) => Number(right.recommended) - Number(left.recommended));
}

function recommendedOption(decision) {
  return (decision.options ?? []).find((option) => option.recommended);
}

function closedLine(decision) {
  const question = decision.number !== undefined ? ` Q${decision.number}` : '';
  return `closed ${decision.id}${question}: ${decision.answer} (${decision.closedBy})`;
}

// -- addDecisions -----------------------------------------------------------

function mergeGiven(existing, given) {
  for (const field of MERGEABLE_FIELDS) {
    if (given[field] !== undefined) existing[field] = given[field];
  }
  if (given.state === 'closed') {
    existing.state = 'closed';
    if (given.answer !== undefined) existing.answer = given.answer;
    if (given.closedBy !== undefined) existing.closedBy = given.closedBy;
    if (given.evidence !== undefined) existing.evidence = given.evidence;
  }
}

function createDecision(given, byId) {
  const decision = { id: given.id, name: given.name };
  for (const field of MERGEABLE_FIELDS) {
    if (field === 'name') continue;
    if (given[field] !== undefined) decision[field] = given[field];
  }
  if (given.state === 'closed') {
    decision.state = 'closed';
    if (given.answer !== undefined) decision.answer = given.answer;
    if (given.closedBy !== undefined) decision.closedBy = given.closedBy;
    if (given.evidence !== undefined) decision.evidence = given.evidence;
  } else {
    const parent = decision.waitsOn !== undefined ? byId.get(decision.waitsOn) : undefined;
    decision.state = parent && parent.state !== 'closed' ? 'waits' : 'open';
  }
  return decision;
}

/** The --add file's decisions folded onto the map: a new id is appended, an
 *  existing non-closed id is merged, a closed id or one carrying number or
 *  round is refused by field name. A null map is created from the file,
 *  round 1. */
export function addDecisions(map, additions) {
  const lines = [];
  const target = map === null ? { round: 1, decisions: [] } : structuredClone(map);
  if (additions.goal !== undefined) target.goal = additions.goal;
  if (additions.lang !== undefined) target.lang = additions.lang;
  if (additions.words !== undefined) target.words = { ...(target.words ?? {}), ...additions.words };
  const byId = new Map(target.decisions.map((decision) => [decision.id, decision]));
  const given = Array.isArray(additions.decisions) ? additions.decisions : [];
  given.forEach((decision, index) => {
    const field = `decisions[${index}]`;
    if (decision === null || typeof decision !== 'object') throw new UsageError(`--add: ${field} must be an object`);
    if (decision.number !== undefined) throw new UsageError(`--add: ${field}.number must not be given`);
    if (decision.round !== undefined) throw new UsageError(`--add: ${field}.round must not be given`);
    const id = requireNonEmptyString(decision.id, `--add: ${field}.id`);
    const existing = byId.get(id);
    if (existing) {
      if (existing.state === 'closed') throw new UsageError(`--add: ${field}.id '${id}' is already closed`);
      mergeGiven(existing, decision);
      if (existing.state === 'closed') lines.push(closedLine(existing));
    } else {
      const created = createDecision({ ...decision, id }, byId);
      target.decisions.push(created);
      byId.set(id, created);
      if (created.state === 'closed') lines.push(closedLine(created));
    }
  });
  return { map: target, lines };
}

// -- applyAnswer --------------------------------------------------------------

function resolveDecision(byId, decisions, entry, field) {
  if (entry.decision !== undefined) {
    const decision = byId.get(entry.decision);
    if (!decision) throw new UsageError(`--apply: ${field} names unknown decision '${entry.decision}'`);
    return decision;
  }
  if (entry.question !== undefined) {
    const decision = decisions.find((item) => item.number === entry.question);
    if (!decision) throw new UsageError(`--apply: ${field} names unknown question Q${entry.question}`);
    return decision;
  }
  throw new UsageError(`--apply: ${field} must name a decision or a question`);
}

function resolveOption(decision, choice, field) {
  const options = decision.options ?? [];
  if (typeof choice === 'string') {
    const option = options.find((item) => item.id === choice);
    if (!option) throw new UsageError(`--apply: ${field}.choice '${choice}' is not an answer of '${decision.id}'`);
    return option;
  }
  if (Number.isInteger(choice)) {
    const option = recommendedFirst(options)[choice - 1];
    if (!option) throw new UsageError(`--apply: ${field}.choice ${choice} is out of range for '${decision.id}'`);
    return option;
  }
  throw new UsageError(`--apply: ${field}.choice must be an answer id or a place`);
}

function closeDecision(decision, option, closedBy, round) {
  const recommended = recommendedOption(decision);
  decision.state = 'closed';
  decision.answer = option.label;
  decision.closedBy = closedBy;
  decision.round = round;
  if (recommended) decision.recommended = recommended.label;
}

/** open, numbered, and asked in the round just closing: picked this round or
 *  carried over with no later round assigned yet. */
function isCurrentRound(decision, round) {
  return decision.state === 'open' && decision.number !== undefined && (decision.round === undefined || decision.round === round);
}

function revertDescendants(parentId, decisions) {
  for (const decision of decisions) {
    if (decision.waitsOn !== parentId || decision.state === 'closed') continue;
    decision.state = 'waits';
    delete decision.number;
    revertDescendants(decision.id, decisions);
  }
}

/** One round's answer applied to the map: a choice or ok closes a decision
 *  as you, go closes every non-closed decision with options as exo, own
 *  words are surfaced for a later --add, reopen returns closed decisions and
 *  their non-closed descendants. Guards a double apply by refusing an
 *  answer.round that does not match the map's round. */
export function applyAnswer(map, answer) {
  if (!Number.isInteger(answer.round)) throw new UsageError('--apply: round must be a whole number');
  if (answer.round !== map.round) {
    throw new UsageError(`--apply: round ${answer.round} does not match the map's round ${map.round}`);
  }
  const target = structuredClone(map);
  const lines = [];
  const askedRound = target.round;
  const byId = new Map(target.decisions.map((decision) => [decision.id, decision]));
  const entries = Array.isArray(answer.answers) ? answer.answers : [];
  const reopenIds = Array.isArray(answer.reopen) ? answer.reopen : [];
  const answeredIds = new Set();

  entries.forEach((entry, index) => {
    const field = `answers[${index}]`;
    const decision = resolveDecision(byId, target.decisions, entry, field);
    answeredIds.add(decision.id);
    if (decision.state === 'closed') throw new UsageError(`--apply: ${field} answers '${decision.id}', which is already closed`);
    if (entry.choice !== null && entry.choice !== undefined) {
      const option = resolveOption(decision, entry.choice, field);
      closeDecision(decision, option, 'you', askedRound);
      lines.push(closedLine(decision));
    } else if (typeof entry.words === 'string' && entry.words.trim() !== '') {
      lines.push(`read ${decision.id}: ${entry.words.trim()}`);
    }
  });

  if (answer.ok === true) {
    for (const decision of target.decisions) {
      if (answeredIds.has(decision.id) || !isCurrentRound(decision, askedRound)) continue;
      closeDecision(decision, recommendedOption(decision), 'you', askedRound);
      lines.push(closedLine(decision));
    }
  }

  if (answer.go === true) {
    for (const decision of target.decisions) {
      if (decision.state === 'closed') continue;
      const recommended = recommendedOption(decision);
      if (!recommended) {
        lines.push(`need ${decision.id}`);
        continue;
      }
      closeDecision(decision, recommended, 'exo', askedRound);
      lines.push(closedLine(decision));
    }
  }

  for (const id of reopenIds) {
    const decision = byId.get(id);
    if (!decision) throw new UsageError(`--apply: reopen names unknown decision '${id}'`);
    if (decision.state !== 'closed') continue;
    decision.state = 'open';
    delete decision.answer;
    delete decision.closedBy;
    delete decision.recommended;
    lines.push(`opened ${decision.id}`);
    revertDescendants(decision.id, target.decisions);
  }

  if (answer.done === true && reopenIds.length === 0) lines.push('checkpoint=done');

  const note = typeof answer.words === 'string' ? answer.words.trim() : '';
  if (note !== '') lines.push(`note: ${note}`);

  target.round = askedRound + 1;
  return { map: target, lines };
}

// -- nextRound ----------------------------------------------------------------

function ancestorsClosed(decision, byId) {
  let current = decision;
  while (current.waitsOn !== undefined) {
    const parent = byId.get(current.waitsOn);
    if (!parent || parent.state !== 'closed') return false;
    current = parent;
  }
  return true;
}

function descendantCount(id, decisions) {
  let count = 0;
  for (const decision of decisions) {
    if (decision.waitsOn !== id || decision.state === 'closed') continue;
    count += 1 + descendantCount(decision.id, decisions);
  }
  return count;
}

/** The map moved to what the next round asks: a waits decision opens once
 *  its parent closed, a ready decision missing content prints need and
 *  leaves the map a draft, otherwise at most ROUND_MAX ready decisions are
 *  picked (numbered first, then most non-closed descendants, then map
 *  order), a new pick gets max(number)+1, and the rest of a checkpoint's
 *  ready set is left for a later round. */
export function nextRound(map) {
  const target = structuredClone(map);
  const lines = [];
  const byId = new Map(target.decisions.map((decision) => [decision.id, decision]));

  for (const decision of target.decisions) {
    if (decision.state !== 'waits') continue;
    const parent = byId.get(decision.waitsOn);
    if (parent && parent.state === 'closed') {
      decision.state = 'open';
      lines.push(`opened ${decision.id}`);
    }
  }

  const ready = target.decisions.filter((decision) => decision.state === 'open' && ancestorsClosed(decision, byId));
  if (ready.length === 0) {
    lines.push(`round=${target.round} checkpoint`);
    return { map: target, lines };
  }

  const missing = ready.filter((decision) => !(decision.question && decision.changes && decision.why && decision.options));
  if (missing.length > 0) {
    for (const decision of missing) lines.push(`need ${decision.id}`);
    lines.push(`round=${target.round} draft`);
    return { map: target, lines };
  }

  const order = new Map(target.decisions.map((decision, index) => [decision.id, index]));
  const priority = [...ready].sort((left, right) => {
    const leftNumbered = left.number !== undefined;
    const rightNumbered = right.number !== undefined;
    if (leftNumbered !== rightNumbered) return leftNumbered ? -1 : 1;
    const byDescendants = descendantCount(right.id, target.decisions) - descendantCount(left.id, target.decisions);
    if (byDescendants !== 0) return byDescendants;
    return order.get(left.id) - order.get(right.id);
  });

  const picked = priority.slice(0, ROUND_MAX);
  const pickedIds = new Set(picked.map((decision) => decision.id));
  let maxNumber = target.decisions.reduce((max, decision) => Math.max(max, decision.number ?? 0), 0);
  for (const decision of picked) {
    if (decision.number === undefined) {
      maxNumber += 1;
      decision.number = maxNumber;
    }
    decision.round = target.round;
  }
  for (const decision of ready) {
    if (!pickedIds.has(decision.id) && decision.number !== undefined) decision.round = target.round + 1;
  }

  lines.push(`round=${target.round} asked=${picked.map((decision) => decision.id).join(',')}`);
  return { map: target, lines };
}
