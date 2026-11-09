const WRAPPING = /^[`'"(\[]+|[`'")\].;]+$/g;
const FILES_LINE = /^[ \t]*(?:[-*][ \t]+)?(?:\*\*)?Files(?::\*\*|\*\*:|:)(.*)$/im;

function createdFiles(prompt) {
  const line = FILES_LINE.exec(prompt)?.[1] ?? '';
  return new Set(line.split(/[,\s]+/).map((raw) => raw.replace(WRAPPING, '')).filter(Boolean));
}

export function absent(entries, prompt) {
  const created = createdFiles(prompt);
  return entries.filter((entry) => !entry.resolved && !created.has(entry.path)).map((entry) => entry.path);
}
