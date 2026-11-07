import { AGENT_PATH, buildJudges, judgePath } from '../../lib/review-judges.mjs';

export function checkReviewJudges(report, repository) {
  const judges = buildJudges(repository.text(repository.join(AGENT_PATH)));
  for (const [name, expected] of Object.entries(judges)) {
    report.assert(
      repository.text(repository.join(judgePath(name))) === expected,
      `review judge ${name} matches ${AGENT_PATH}`,
      `${judgePath(name)} is generated`,
      `${judgePath(name)} differs from its generated form; run node benchmarks/review-judges/generate.mjs`,
    );
  }
}
