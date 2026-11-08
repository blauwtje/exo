import fs from 'node:fs';
import path from 'node:path';
import { readJsonOrNull } from './basics.mjs';

const FIX_TYPE = 'exo:fix-review';
const FIX_MARKER = /^exo-kind: fix-review$/m;
const BUILD_TASK = /(^|:)build-task$/;

export function isFixBrief(brief) {
  return FIX_MARKER.test(String(brief ?? ''));
}

export function dispatchType(type, brief) {
  if (!BUILD_TASK.test(type)) return type;
  return isFixBrief(brief) ? FIX_TYPE : type;
}

function firstLine(file) {
  if (!fs.existsSync(file)) return '';
  return fs.readFileSync(file, 'utf8').split('\n')[0];
}

function briefText(file) {
  const line = firstLine(file);
  try {
    const content = JSON.parse(line)?.message?.content;
    return typeof content === 'string' ? content : JSON.stringify(content);
  } catch {
    return '';
  }
}

export function subagentType(transcriptFile) {
  const meta = readJsonOrNull(transcriptFile.replace(/\.jsonl$/, '.meta.json'));
  return dispatchType(meta?.agentType ?? 'unknown', briefText(transcriptFile));
}

export function isFixDispatch(type, brief) {
  return dispatchType(type, brief).endsWith('fix-review');
}

export function subagentTypes(transcriptPath) {
  const directory = path.join(transcriptPath.replace(/\.jsonl$/, ''), 'subagents');
  if (!fs.existsSync(directory)) return [];
  const names = fs.readdirSync(directory).filter((name) => name.endsWith('.meta.json')).sort();
  return names.map((name) => subagentType(path.join(directory, name.replace(/\.meta\.json$/, '.jsonl'))));
}

export function countFixRounds(types = []) {
  return types.filter((type) => type === FIX_TYPE).length;
}
