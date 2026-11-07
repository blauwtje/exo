import { buildGraph } from '../skill-graph-build.mjs';

const NAME = 'skill graph';

export function checkSkillGraph(report, repository) {
  let graph;
  try {
    graph = buildGraph();
  } catch (error) {
    report.result('FAIL', NAME, `the graph does not build: ${error.message}`);
    return;
  }
  const filed = new Set(graph.files.map((file) => file.path));
  const missing = repository.skillDirectories()
    .map((skill) => `skills/${skill}/SKILL.md`)
    .filter((entry) => !filed.has(entry));
  report.assert(
    missing.length === 0 && graph.edges.length > 0,
    NAME,
    `${graph.files.length} files, ${graph.sections.length} sections and ${graph.edges.length} edges build into one graph`,
    missing.length > 0 ? `${missing.join(', ')} missing from the graph` : 'the graph has no edges'
  );
}
