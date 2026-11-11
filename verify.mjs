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
import { checkProcessStructure } from './verify/checks/process-structure.mjs';
import { checkMarkdownReferences } from './verify/checks/markdown-references.mjs';
import { checkAgentDescriptionBudgets, checkDescriptionBudgets } from './verify/checks/description-budgets.mjs';
import { checkRouting } from './verify/checks/routing.mjs';
import { checkNameClash } from './verify/checks/name-clash.mjs';
import { checkPluginValidate } from './verify/checks/plugin-validate.mjs';
import { checkTestSize } from './verify/checks/test-size.mjs';
import { checkModuleSize } from './verify/checks/module-size.mjs';
import { checkModuleSurface } from './verify/checks/module-surface.mjs';
import { checkAgentDuplicates } from './verify/checks/agent-duplicates.mjs';
import { checkTestTiming } from './verify/checks/test-timing.mjs';
import { checkGitHelper } from './verify/checks/git-helper.mjs';
import { checkTestGitEnv } from './verify/checks/test-git-env.mjs';
import { checkCoveringTests } from './verify/checks/covering-tests.mjs';
import { checkBoundaryRows } from './verify/checks/boundary-rows.mjs';
import { checkBehaviourCurrent } from './verify/checks/behaviour-current.mjs';
import { checkFoldedNames } from './verify/checks/folded-names.mjs';
import { checkChangelogPlacement } from './verify/checks/changelog-placement.mjs';
import { checkBannedText } from './verify/checks/banned-text.mjs';
import { checkLoopKinds } from './verify/checks/loop-kinds.mjs';
import { checkDerivation } from './verify/checks/derivation.mjs';
import { checkBodyBudgets } from './verify/checks/body-budgets.mjs';
import { checkBudgetRaises } from './verify/checks/budget-raises.mjs';
import { checkReferenceTables } from './verify/checks/reference-tables.mjs';
import { checkReferenceSplit } from './verify/checks/reference-split.mjs';
import { checkReferenceShape } from './verify/checks/reference-shape.mjs';
import { checkSharedContracts } from './verify/checks/shared-contracts.mjs';
import { checkReturnCaps } from './verify/checks/return-caps.mjs';
import { checkBackgroundStops } from './verify/checks/background-stops.mjs';
import { checkRunContract } from './verify/checks/run-contract.mjs';
import { checkProcessLifetime } from './verify/checks/process-lifetime.mjs';
import { checkResearchOrchestrator } from './verify/checks/research-orchestrator.mjs';
import { checkForegroundDispatch } from './verify/checks/foreground-dispatch.mjs';
import { checkScriptSyntax } from './verify/checks/script-syntax.mjs';
import { checkSkillScripts } from './verify/checks/skill-scripts.mjs';
import { checkSkillGraph } from './verify/checks/skill-graph.mjs';
import { startSkillScriptBehavior } from './verify/checks/skill-script-behavior.mjs';
import { checkCodeComments } from './verify/checks/code-comments.mjs';
import { checkDenyReasons } from './verify/checks/deny-reasons.mjs';
import { checkHookRefusals } from './verify/checks/hook-refusals.mjs';
import { checkRefusalAll } from './verify/checks/refusal-all.mjs';
import { checkStepReferences } from './verify/checks/step-references.mjs';
import { checkScriptOutput } from './verify/checks/script-output.mjs';
import { checkHookBudgets } from './verify/checks/hook-budgets.mjs';
import { checkBriefGrammar } from './verify/checks/brief-grammar.mjs';
import { checkReadEstimates } from './verify/checks/read-estimates.mjs';

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
checkProcessStructure(report, repository);
checkMarkdownReferences(report, repository);
checkStepReferences(report, repository);
checkDescriptionBudgets(report, repository);
checkAgentDescriptionBudgets(report, repository);
checkRouting(report, repository, { staticOnly: values.static });
checkScriptOutput(report, repository);
checkHookBudgets(report, repository);
checkNameClash(report, repository);
checkPluginValidate(report, repository);
checkTestSize(report, repository);
checkModuleSize(report, repository);
checkModuleSurface(report, repository);
checkAgentDuplicates(report, repository);
checkTestTiming(report, repository);
checkTestGitEnv(report, repository);
checkGitHelper(report, repository);
checkCoveringTests(report, repository);
checkBoundaryRows(report, repository);
checkBehaviourCurrent(report, repository);
checkFoldedNames(report, repository);
checkChangelogPlacement(report, repository);
checkBannedText(report, repository);
checkLoopKinds(report, repository);
checkDerivation(report, repository);
checkBodyBudgets(report, repository);
await checkBudgetRaises(report, repository);
checkReferenceTables(report, repository);
checkReferenceSplit(report, repository);
checkReferenceShape(report, repository);
checkSharedContracts(report, repository);
checkReturnCaps(report, repository);
checkBackgroundStops(report, repository);
checkRunContract(report, repository);
checkProcessLifetime(report, repository);
checkResearchOrchestrator(report, repository);
checkForegroundDispatch(report, repository);
checkReadEstimates(report, repository);
checkBriefGrammar(report, repository);
checkScriptSyntax(report, repository);
checkSkillScripts(report, repository);
checkSkillGraph(report, repository);
checkCodeComments(report, repository);
checkDenyReasons(report, repository);
checkHookRefusals(report, repository);
checkRefusalAll(report, repository);
if (behavior) {
  const outcome = await behavior;
  report.result(outcome.status, outcome.name, outcome.detail);
}
runLateChecks(report, repository, values.static);

const counts = report.counts();
console.log(`SUMMARY PASS=${counts.PASS} FAIL=${counts.FAIL} WARN=${counts.WARN} UNRUN=${counts.UNRUN}`);
process.exit(counts.FAIL > 0 ? 1 : 0);
