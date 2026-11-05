import { DECLARATION_KEYWORDS, IDENTIFIER, LIST_MARKER, fenceAfter } from './plan-tasks.mjs';

export function codeBlocks(section) {
  const blocks = [];
  let fence = 0;
  let lines = null;
  for (const line of section.split('\n')) {
    const before = fence;
    fence = fenceAfter(line, fence);
    if (before === 0 && fence !== 0) {
      lines = [];
      continue;
    }
    if (before !== 0 && fence === 0) {
      blocks.push(lines.join('\n'));
      lines = null;
      continue;
    }
    if (lines !== null) lines.push(line);
  }
  return blocks;
}

export function definesRegion(line, region) {
  const stripped = line.trimStart().replace(LIST_MARKER, '');
  if (!IDENTIFIER.test(region)) return stripped.startsWith(region);
  const escaped = region.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`^${escaped}\\s*[:=]`).test(stripped)) return true;
  const declared = stripped.match(DECLARATION_KEYWORDS);
  const named = stripped.slice(declared?.[0].length ?? 0);
  if (declared !== null && new RegExp(`^${escaped}(?![\\w$])`).test(named)) return true;
  return new RegExp(`^${escaped}\\s*\\([^()]*\\)\\s*(?::[^{]*)?\\{`).test(named);
}

export function alreadyApplied(section, region, content) {
  return codeBlocks(section).some((block) => block.includes(region) && content.includes(block));
}

export function regionRange(content, region) {
  const lines = content.split('\n');
  const startIndex = lines.findIndex((line) => definesRegion(line, region));
  if (startIndex === -1) return null;
  const indent = lines[startIndex].match(/^\s*/)[0].length;
  let end = startIndex;
  for (let i = startIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const lineIndent = line.match(/^\s*/)[0].length;
    if (lineIndent < indent) break;
    if (lineIndent === indent) {
      if (/^[)}\]]+[;,]?$/.test(line.trim())) end = i;
      break;
    }
    end = i;
  }
  return { start: startIndex + 1, end: end + 1 };
}
