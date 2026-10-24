// why: a known-FAIL facts label needs ground truth without a human; deleting every part of a reply that carries one required fact makes the reply miss that fact by construction, whatever the source reply's own verdict was.
const DASHES = String.fromCodePoint(0x2013, 0x2014);
const SEPARATOR = new RegExp(`(\\n+|(?<=[.!?])\\s+|;\\s+|:\\s+|\\s[${DASHES}]\\s|,\\s+)`, 'u');
const TRAILING = new RegExp(`[\\s,;:${DASHES}]+$`, 'u');
const STOPWORDS = new Set(['the', 'and', 'for', 'are', 'was', 'were', 'with', 'from', 'that', 'this', 'these', 'those', 'its', 'into', 'than', 'then', 'them', 'they', 'their', 'there', 'has', 'have', 'had', 'but', 'not', 'can', 'will', 'would', 'should', 'could', 'only', 'also', 'just', 'all', 'any', 'each', 'per', 'via', 'yes', 'about', 'which', 'what', 'when', 'where', 'who', 'how', 'does', 'did', 'done', 'one', 'too', 'you', 'your', 'use', 'uses', 'used', 'own', 'more', 'less', 'most', 'mostly']);
const STEM = 5;
const POLARITY = { yes: 'yes', yeah: 'yes', ja: 'yes', no: 'no', nope: 'no', nee: 'no', maybe: 'maybe', misschien: 'maybe' };

const stems = (text) => new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u)
  .filter((word) => /^\p{N}+$/u.test(word) || (word.length >= 3 && !STOPWORDS.has(word)))
  .map((word) => word.slice(0, STEM)));

const hits = (factStems, text) => {
  const own = stems(text);
  return [...factStems].filter((stem) => own.has(stem)).length;
};

// why: "no, stay with Node" survives in a kept "No: Python adds risk", because the answer word restates the rest; such a fact counts as dropped only when its answer word goes too.
const polarity = (text) => {
  const words = text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  return POLARITY[words[0] === 'mostly' ? words[1] : words[0]];
};

function tidy(text, endsWithStop) {
  let out = text.trim().replace(TRAILING, '');
  if (out.length === 0) return out;
  out = out[0].toUpperCase() + out.slice(1);
  return endsWithStop && !/[.!?]$/.test(out) ? `${out}.` : out;
}

// why: a removed part must carry most of the fact's words and the kept text none of them; a kept "11/11 on claude-sonnet" still stated "uses Sonnet" when one shared word was allowed.
function dropOne(inner, fact) {
  const factStems = stems(fact);
  if (factStems.size < 2) return null;
  const need = Math.max(1, Math.ceil(factStems.size / 2));
  const pieces = inner.split(SEPARATOR);
  const removed = pieces.filter((piece, i) => i % 2 === 0 && hits(factStems, piece) >= need);
  if (removed.length === 0) return null;
  const kept = [];
  pieces.forEach((piece, i) => {
    if (i % 2 === 1 || removed.includes(piece)) return;
    // why: after a cut, a kept sentence end followed by the cut part's ", " read "does., so"; a sentence end keeps a plain space and the next part starts upper case.
    const afterStop = kept.length > 0 && /[.!?]$/.test(kept.at(-1));
    if (kept.length > 0) kept.push(afterStop ? ' ' : pieces[i - 1]);
    kept.push(afterStop ? piece[0].toUpperCase() + piece.slice(1) : piece);
  });
  const rest = kept.join('');
  if (stems(rest).size < 2 || hits(factStems, rest) > 0) return null;
  if (polarity(fact) && polarity(fact) === polarity(rest)) return null;
  return { rest, removed };
}

// why: of the facts that can be cut cleanly, the smallest cut keeps the variant closest to a real reply.
export function dropFact(reply, facts) {
  const trimmed = reply.trim();
  const bold = /^\*\*([\s\S]*)\*\*$/.exec(trimmed);
  const inner = bold ? bold[1] : trimmed;
  const endsWithStop = /[.!?]$/.test(inner);
  let best = null;
  facts.forEach((fact, index) => {
    const out = dropOne(inner, fact);
    if (!out) return;
    const size = out.removed.join('').length;
    if (!best || size < best.size) best = { ...out, index, size };
  });
  if (!best) return null;
  const body = tidy(best.rest, endsWithStop);
  return { reply: bold ? `**${body}**` : body, fact: facts[best.index], factIndex: best.index, removed: best.removed };
}

// why: a reply judged with no gate failure and no judge:facts is a stored reply that passes facts; runs[].failed is per reply, an old log has only the per-case union, so it counts only with one reply.
export function passingLogReplies(log, name) {
  const out = [];
  for (const p of log.perCase ?? []) {
    (p.replies ?? []).forEach((reply, n) => {
      const failed = p.runs?.[n]?.failed ?? (p.replies.length === 1 ? p.failed : null);
      if (!Array.isArray(failed) || failed.some((f) => f === 'judge:facts' || !f.startsWith('judge:'))) return;
      out.push({ caseId: p.id, source: `${name}:${p.id}:${n}`, reply });
    });
  }
  return out;
}

function sourcesFor({ passRows, logs, cases, baseline }) {
  const byCase = new Map(cases.map((c) => [c.id, c]));
  const fromCase = (arm) => ({ caseId, source, reply }) => {
    const c = byCase.get(caseId);
    return c ? [{ source, arm, caseId, from: source, question: c.question, facts: c.facts, reply }] : [];
  };
  return [
    ...passRows.filter((row) => row.dimension === 'facts' && row.label === 'PASS' && !row.built)
      .map((row) => ({ source: `labels:${row.id}`, arm: 'default', caseId: row.id, from: row.id, question: row.question, facts: row.facts, reply: row.reply })),
    ...logs.flatMap(({ name, log }) => passingLogReplies(log, name).flatMap(fromCase('adhd'))),
    // why: baseline replies carry no verdict, but a label built by construction holds whatever the source said; one row per case keeps the default arm from outnumbering the adhd one.
    ...cases.flatMap((c) => (baseline[c.id]?.replies ?? []).map((reply, n) => ({ caseId: c.id, source: `baseline:${c.id}:${n}`, reply })).flatMap(fromCase('baseline'))),
  ];
}

export function buildFailRows({ passRows = [], logs = [], cases = [], baseline = {} }) {
  const rows = [];
  const seen = new Set();
  const perCase = new Set();
  for (const s of sourcesFor({ passRows, logs, cases, baseline })) {
    if (seen.has(s.reply) || (s.arm === 'baseline' && perCase.has(s.caseId))) continue;
    seen.add(s.reply);
    const drop = dropFact(s.reply, s.facts);
    if (!drop) continue;
    if (s.arm === 'baseline') perCase.add(s.caseId);
    rows.push({
      id: `${s.from}~drop-fact${drop.factIndex}`, dimension: 'facts', question: s.question, facts: s.facts, reply: drop.reply, label: 'FAIL',
      built: { by: 'drop-fact', arm: s.arm === 'baseline' ? 'default' : s.arm, source: s.source, fact: drop.fact, removed: drop.removed },
    });
  }
  return rows;
}
