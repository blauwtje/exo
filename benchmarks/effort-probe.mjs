import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const META_SUFFIX = '.meta.json';

function shownEffort(metaFile) {
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  return typeof meta.effort === 'string' && meta.effort !== '' ? meta.effort : null;
}

export function probeRecords({ subagents, passed }) {
  const metaFiles = fs.readdirSync(subagents).filter((name) => name.endsWith(META_SUFFIX)).sort();
  return metaFiles.map((name) => {
    const shown = shownEffort(path.join(subagents, name));
    const agentId = name.slice('agent-'.length, -META_SUFFIX.length);
    return { agentId, passed, shown, honored: shown === passed };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [subagents, passed] = process.argv.slice(2);
  if (!subagents || !passed) {
    console.error('usage: node benchmarks/effort-probe.mjs <subagents-dir> <passed-effort>');
    process.exit(2);
  }
  for (const record of probeRecords({ subagents, passed })) {
    console.log(JSON.stringify(record));
  }
}
