// Deterministic verification of the skill corpus: no model calls, no network.
//
//   node verify.mjs [--repository-root <dir>] [--static]
//
// Exits 1 when any check failed.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { createReport } from './verify/report.mjs';
import { runLateChecks } from './verify/late-checks.mjs';
import { createRepository } from './verify/repository.mjs';
import { checkSkillFrontmatter } from './verify/checks/skill-frontmatter.mjs';
import { checkMarkdownReferences } from './verify/checks/markdown-references.mjs';
import { checkNameClash } from './verify/checks/name-clash.mjs';
import { checkPluginValidate } from './verify/checks/plugin-validate.mjs';
import { checkGitHelper } from './verify/checks/git-helper.mjs';
import { checkFoldedNames } from './verify/checks/folded-names.mjs';
import { checkShippedTextScan } from './verify/checks/shipped-text-scan.mjs';
import { checkLoopKinds } from './verify/checks/loop-kinds.mjs';
import { checkWorktreePaths } from './verify/checks/worktree-paths.mjs';
import { checkDerivation } from './verify/checks/derivation.mjs';
import { checkReferenceSplit } from './verify/checks/reference-split.mjs';
import { checkBackgroundStops } from './verify/checks/background-stops.mjs';
import { checkRoutingTargets } from './verify/checks/routing-targets.mjs';
import { checkRunContract } from './verify/checks/run-contract.mjs';
import { checkProcessLifetime } from './verify/checks/process-lifetime.mjs';
import { checkForegroundDispatch } from './verify/checks/foreground-dispatch.mjs';
import { checkScriptSyntax } from './verify/checks/script-syntax.mjs';
import { checkSkillScripts } from './verify/checks/skill-scripts.mjs';
import { checkSkillGraph } from './verify/checks/skill-graph.mjs';
import { startSkillScriptBehavior } from './verify/checks/skill-script-behavior.mjs';
import { checkDenyReasons } from './verify/checks/deny-reasons.mjs';
import { checkHookRefusals } from './verify/checks/hook-refusals.mjs';
import { checkRefusalFixtures } from './verify/checks/refusal-fixtures.mjs';
import { checkRefusalAll } from './verify/checks/refusal-all.mjs';
import { checkStepReferences } from './verify/checks/step-references.mjs';
import { checkScriptOutput } from './verify/checks/script-output.mjs';
import { checkHookBudgets } from './verify/checks/hook-budgets.mjs';
import { checkSizeBudgets } from './verify/checks/size-budgets.mjs';

const MINIMUM_NODE_MAJOR = 22;

const { values } = parseArgs({
  options: {
    'repository-root': { type: 'string' },
    static: { type: 'boolean', default: false }
  }
});

const major = Number(process.versions.node.split('.')[0]);
if (major < MINIMUM_NODE_MAJOR) {
  console.error(`node ${process.versions.node} is too old; this verifier needs node ${MINIMUM_NODE_MAJOR} or newer`);
  process.exit(1);
}

const root = path.resolve(values['repository-root'] ?? import.meta.dirname);
if (!fs.existsSync(path.join(root, 'skills'))) {
  console.error(`skills/ not found at ${path.join(root, 'skills')}`);
  process.exit(1);
}

const report = createReport();
const repository = createRepository(root);
const behavior = values.static ? null : startSkillScriptBehavior(repository);

checkSkillFrontmatter(report, repository);
checkMarkdownReferences(report, repository);
checkStepReferences(report, repository);
checkScriptOutput(report, repository);
checkHookBudgets(report, repository);
checkSizeBudgets(report, repository);
checkNameClash(report, repository);
checkPluginValidate(report, repository);
checkGitHelper(report, repository);
checkFoldedNames(report, repository);
checkShippedTextScan(report, repository);
checkLoopKinds(report, repository);
checkWorktreePaths(report, repository);
checkDerivation(report, repository);
checkReferenceSplit(report, repository);
checkBackgroundStops(report, repository);
checkRoutingTargets(report, repository);
checkRunContract(report, repository);
checkProcessLifetime(report, repository);
checkForegroundDispatch(report, repository);
checkScriptSyntax(report, repository);
checkSkillScripts(report, repository);
checkSkillGraph(report, repository);
checkDenyReasons(report, repository);
checkHookRefusals(report, repository);
checkRefusalAll(report, repository);
checkRefusalFixtures(report, repository);
if (behavior) {
  const outcome = await behavior;
  report.result(outcome.status, outcome.name, outcome.detail);
}
runLateChecks(report, repository, values.static);

const counts = report.counts();
console.log(`SUMMARY PASS=${counts.PASS} FAIL=${counts.FAIL} WARN=${counts.WARN} UNRUN=${counts.UNRUN}`);
process.exit(counts.FAIL > 0 ? 1 : 0);
