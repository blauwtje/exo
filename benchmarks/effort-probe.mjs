import fs from 'node:fs';
import path from 'node:path';
import { isMain } from '#script-flags';

const META_SUFFIX = '.meta.json';
const AGENT_PREFIX = 'agent-';

function shownEffort(metaFile) {
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  return typeof meta.effort === 'string' && meta.effort !== '' ? meta.effort : null;
}

export function probeRecords({ subagents, passed }) {
  const metaFiles = fs.readdirSync(subagents).filter((name) => name.endsWith(META_SUFFIX)).sort();
  return metaFiles.map((name) => {
    const shown = shownEffort(path.join(subagents, name));
    const agentId = name.slice(0, -META_SUFFIX.length).replace(AGENT_PREFIX, '');
    return { agentId, passed, shown, honored: shown === passed };
  });
}

if (isMain(import.meta.url)) {
  const [subagents, passed] = process.argv.slice(2);
  if (!subagents || !passed) {
    console.error('usage: node benchmarks/effort-probe.mjs <subagents-dir> <passed-effort>');
    process.exit(2);
  }
  for (const record of probeRecords({ subagents, passed })) {
    console.log(JSON.stringify(record));
  }
}
