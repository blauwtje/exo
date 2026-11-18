import fs from 'node:fs';

const SPAN = /`([^`]+)`/g;

const isPath = (span) => !/\s/.test(span) && (span.includes('/') || /\.\w+$/.test(span));

function markerIndex(line) {
  return [...line.matchAll(/exo:/g)].find((match) => (line.slice(0, match.index).match(/`/g) ?? []).length % 2 === 0)?.index ?? -1;
}

function citedPaths(text) {
  return text.split('\n').flatMap((line) => {
    const start = markerIndex(line);
    if (start === -1) return [];
    return [...line.slice(start).matchAll(SPAN)]
      .map((match) => match[1].replace(/:\d+(-\d+)?$/, ''))
      .filter(isPath);
  });
}

function missingIn(repository, page) {
  return citedPaths(fs.readFileSync(repository.join('principles', page), 'utf8'))
    .filter((cited) => !fs.existsSync(repository.join(cited)))
    .map((cited) => `principles/${page} cites ${cited}, which does not exist`);
}

export function checkPrincipleCitations(report, repository) {
  const directory = repository.join('principles');
  const pages = fs.existsSync(directory) ? fs.readdirSync(directory).filter((name) => name.endsWith('.md')) : [];
  const problems = pages.flatMap((page) => missingIn(repository, page));
  report.assert(
    problems.length === 0,
    'principle citations',
    { pass: 'every exo path a principle page cites exists', fail: problems.join('; ') }
  );
}
