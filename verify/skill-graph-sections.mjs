import { BYTES_PER_TOKEN } from './budgets.mjs';

export function readDescription(text) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return '';
  const closing = lines.indexOf('---', 1);
  if (closing < 0) return '';
  for (const line of lines.slice(1, closing)) {
    const match = /^description: +(.+)$/.exec(line);
    if (!match) continue;
    const raw = match[1];
    if (raw.startsWith('"')) {
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    }
    return raw;
  }
  return '';
}

export function parseSections(relativePath, text) {
  const lines = text.split('\n');
  const headingLine = /^(#{1,6})\s+(.*)$/;
  const headings = [];
  lines.forEach((line, index) => {
    const match = headingLine.exec(line);
    if (match) headings.push({ level: match[1].length, heading: match[2].trim(), lineIndex: index });
  });
  const sections = [];
  headings.forEach((current, position) => {
    let endIndex = lines.length - 1;
    for (let next = position + 1; next < headings.length; next += 1) {
      if (headings[next].level <= current.level) {
        endIndex = headings[next].lineIndex - 1;
        break;
      }
    }
    const bytes = Buffer.byteLength(lines.slice(current.lineIndex, endIndex + 1).join('\n'), 'utf8');
    sections.push({
      path: relativePath,
      heading: current.heading,
      level: current.level,
      startLine: current.lineIndex + 1,
      endLine: endIndex + 1,
      bytes,
      tokens: Math.floor(bytes / BYTES_PER_TOKEN)
    });
  });
  return sections;
}

export function normalizeHeading(heading) {
  return heading.replace(/^#+\s*/, '').trim().toLowerCase();
}
