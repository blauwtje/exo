import path from 'node:path';
import { readFrontmatter } from '../frontmatter.mjs';

const SECTIONS = ['Purpose', 'Prerequisites', 'Instructions', 'Examples', 'Limitations', 'Troubleshooting'];
const SCRIPTS_SECTION = 'Available Scripts';
const TABLE_HEADERS = {
  Troubleshooting: ['Error', 'Cause', 'Solution'],
  [SCRIPTS_SECTION]: ['Script', 'Purpose', 'Arguments']
};
const METADATA_FIELDS = ['metadata.author', 'metadata.tags'];

function tableCells(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function sectionsOf(lines) {
  const sections = [];
  let fenced = false;
  for (const line of lines) {
    if (line.startsWith('```')) fenced = !fenced;
    const heading = !fenced && /^## (?<title>.+?)\s*$/.exec(line);
    if (heading) sections.push({ title: heading.groups.title, lines: [] });
    else if (sections.length > 0) sections.at(-1).lines.push(line);
  }
  return sections;
}

function isSeparator(cells) {
  return cells.every((cell) => /^:?-+:?$/.test(cell));
}

function sectionTable(section) {
  const [header, separator, ...rows] = section.lines.filter((line) => line.trim().startsWith('|')).map(tableCells);
  const expected = TABLE_HEADERS[section.title];
  const valid = header && header.join('|') === expected.join('|') && separator && isSeparator(separator) && rows.length > 0;
  return valid ? rows : undefined;
}

function sectionTableErrors(section, scriptFiles) {
  const expected = TABLE_HEADERS[section.title];
  if (!expected) return [];
  const rows = sectionTable(section);
  if (!rows) return [`## ${section.title} needs a table with the header | ${expected.join(' | ')} |, a separator row and a data row`];
  if (section.title !== SCRIPTS_SECTION) return [];
  return rows
    .map((row) => row[0].replace(/`/g, ''))
    .filter((script) => !scriptFiles.includes(script))
    .map((script) => `## ${SCRIPTS_SECTION} names ${script}, which is not under scripts/`);
}

function scriptRowErrors(sections) {
  const table = sections.find((section) => section.title === SCRIPTS_SECTION);
  const rowNames = new Set((table ? sectionTable(table) ?? [] : []).map((row) => row[0].replace(/`/g, '')));
  const text = sections.filter((section) => section !== table).flatMap((section) => section.lines).join('\n');
  const named = new Set([...text.matchAll(/scripts\/([\w./-]*\w)/g)].map((match) => match[1]));
  return [...named]
    .filter((script) => !rowNames.has(script))
    .map((script) => `## ${SCRIPTS_SECTION} lacks a row for scripts/${script}, which the text names`);
}

function sectionErrors(sections, scriptFiles) {
  const expected = scriptFiles.length > 0 ? [...SECTIONS, SCRIPTS_SECTION] : SECTIONS;
  const found = sections.map((section) => section.title);
  const orderErrors = found.join('|') === expected.join('|')
    ? []
    : [`## headings are ${found.join(', ') || 'missing'}, expected ${expected.join(', ')}`];
  return [...orderErrors, ...sections.flatMap((section) => sectionTableErrors(section, scriptFiles)), ...scriptRowErrors(sections)];
}

function metadataErrors(values) {
  return METADATA_FIELDS.filter((field) => !values.has(field)).map((field) => `frontmatter lacks ${field}`);
}

function fileErrors(repository, file) {
  const lines = repository.lines(file);
  const { values } = readFrontmatter(lines);
  const body = lines.slice(lines.indexOf('---', 1) + 1);
  const scriptFiles = repository
    .walk(path.join(path.dirname(file), 'scripts'), () => true)
    .map((script) => path.relative(path.join(path.dirname(file), 'scripts'), script).split(path.sep).join('/'));
  return [...metadataErrors(values), ...sectionErrors(sectionsOf(body), scriptFiles)];
}

export function skillSectionErrors(repository) {
  return repository.everySkillFile().flatMap((file) => {
    const relative = repository.relative(file);
    return fileErrors(repository, file).map((message) => `${relative}: ${message}`);
  });
}

export function checkSkillSections(report, repository) {
  const errors = skillSectionErrors(repository);
  report.assert(
    errors.length === 0,
    'Skill sections',
    { pass: 'every skill follows the NVIDIA section format', fail: errors.join('; ') }
  );
}
