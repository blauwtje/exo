export function wrapText(text, width) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  for (const word of words) {
    const last = lines.at(-1);
    if (last !== undefined && last.length + 1 + word.length <= width) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines.join('\n');
}
