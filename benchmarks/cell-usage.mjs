// benchmarks/cell-usage.mjs
// What a cell's session spent across every transcript, the main thread and
// each subagent, saved as <cell>/usage.json. The result JSON's usage block
// holds the main thread only, so a subagent on another model would drop out
// of the tokens metric; score.mjs reads this file and never a transcript.

import fs from 'node:fs';
import path from 'node:path';
import { emptySession } from '../skills/savings/scripts/ledger.mjs';
import { sumCounts } from '../skills/savings/scripts/token-weights.mjs';
import { findTranscript, ingestTranscript, sumTokens } from '../skills/savings/scripts/transcript.mjs';

// The session hook's context carries this heading only while exo savings are on.
const LADDER_HEADING = '## The ladder';

function subagentTypes(transcriptPath) {
  const subagents = path.join(transcriptPath.replace(/\.jsonl$/, ''), 'subagents');
  if (!fs.existsSync(subagents)) return [];
  const types = [];
  for (const name of fs.readdirSync(subagents).sort()) {
    if (!name.endsWith('.meta.json')) continue;
    const meta = JSON.parse(fs.readFileSync(path.join(subagents, name), 'utf8'));
    types.push(meta.agentType ?? 'unknown');
  }
  return types;
}

function ladderInContext(transcriptPath) {
  for (const line of fs.readFileSync(transcriptPath, 'utf8').split('\n')) {
    if (!line.includes('hook_additional_context')) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const content = entry?.attachment?.content;
    if (!Array.isArray(content)) continue;
    if (content.some((text) => typeof text === 'string' && text.includes(LADDER_HEADING))) return true;
  }
  return false;
}

function countsByModel(session) {
  const grouped = {};
  for (const counts of Object.values(session.usageById)) {
    const model = counts.model ?? 'unknown';
    grouped[model] = grouped[model] ?? [];
    grouped[model].push(counts);
  }
  return Object.fromEntries(Object.entries(grouped).map(([model, list]) => [model, sumCounts(list)]));
}

// Returns the written usage, or null when the session's transcript is gone.
export function writeCellUsage(cellDirectory, sessionId) {
  const transcript = findTranscript(sessionId);
  if (transcript === null) return null;
  const session = emptySession();
  ingestTranscript(session, transcript);
  const usage = {
    transcript,
    counts: sumTokens(session),
    byModel: countsByModel(session),
    subagents: subagentTypes(transcript),
    ladder: ladderInContext(transcript)
  };
  fs.writeFileSync(path.join(cellDirectory, 'usage.json'), `${JSON.stringify(usage, null, 2)}\n`);
  return usage;
}
