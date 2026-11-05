import fs from 'node:fs';
import path from 'node:path';
import { ROOT, relFromRoot, listDocFiles, listCodeFiles, skillNameFromPath } from './skill-graph-files.mjs';
import { parseSections } from './skill-graph-sections.mjs';
import { extractLinks, extractPointers, extractPins } from './skill-graph-edges.mjs';

export function buildGraph() {
  const docPaths = listDocFiles();
  const codePaths = listCodeFiles();

  const docFiles = docPaths.map((absolute) => ({ path: relFromRoot(absolute), text: fs.readFileSync(absolute, 'utf8') }));
  const codeFiles = codePaths.map((absolute) => ({ path: relFromRoot(absolute), text: fs.readFileSync(absolute, 'utf8') }));

  const files = [...docFiles, ...codeFiles].map((f) => ({
    kind: 'file',
    path: f.path,
    bytes: Buffer.byteLength(f.text, 'utf8'),
    skill: skillNameFromPath(f.path)
  }));

  const skillNames = fs
    .readdirSync(path.join(ROOT, 'skills'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(ROOT, 'skills', entry.name, 'SKILL.md')))
    .map((entry) => entry.name);

  const sections = [];
  for (const doc of docFiles) sections.push(...parseSections(doc.path, doc.text));

  const graph = { root: ROOT, files, skillNames, sections, links: [], pointers: [], pins: [] };

  for (const doc of docFiles) {
    const lines = doc.text.split('\n');
    graph.links.push(...extractLinks(doc.path, lines));
    graph.pointers.push(...extractPointers(graph, doc.path, lines));
  }
  graph.pins = extractPins(codeFiles, docFiles);

  graph.filesByPath = new Map(files.map((f) => [f.path, f]));
  graph.edges = [...graph.links, ...graph.pointers, ...graph.pins];
  return graph;
}
