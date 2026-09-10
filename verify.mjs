// Deterministic verification of the skill corpus: no model calls, no network.
//
//   node verify.mjs [--repository-root <dir>] [--skip-link-check] [--self-test]
//
// Exits 1 when any check failed.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { createReport } from './verify/report.mjs';
import { createRepository } from './verify/repository.mjs';
import { checkSkillFrontmatter } from './verify/checks/skill-frontmatter.mjs';
import { checkProcessStructure } from './verify/checks/process-structure.mjs';
import { checkMarkdownReferences } from './verify/checks/markdown-references.mjs';
import { checkDescriptionBudgets } from './verify/checks/description-budgets.mjs';
import { checkBannedText } from './verify/checks/banned-text.mjs';
import { checkReferenceTables } from './verify/checks/reference-tables.mjs';
import { checkSharedContracts } from './verify/checks/shared-contracts.mjs';
import { checkScriptSyntax } from './verify/checks/script-syntax.mjs';
import { checkSkillScripts } from './verify/checks/skill-scripts.mjs';
import { checkSkillScriptBehavior } from './verify/checks/skill-script-behavior.mjs';
import { checkGitWhitespace } from './verify/checks/git-whitespace.mjs';
import { runSelfTest } from './verify/self-test.mjs';

const MINIMUM_NODE_MAJOR = 22;

const { values } = parseArgs({
  options: {
    'repository-root': { type: 'string' },
    'skip-link-check': { type: 'boolean', default: false },
    'self-test': { type: 'boolean', default: false }
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
const options = { skipLinkCheck: values['skip-link-check'] };

checkSkillFrontmatter(report, repository, options);
checkProcessStructure(report, repository, options);
checkMarkdownReferences(report, repository, options);
checkDescriptionBudgets(report, repository, options);
checkBannedText(report, repository, options);
checkReferenceTables(report, repository, options);
checkSharedContracts(report, repository, options);
checkScriptSyntax(report, repository, options);
checkSkillScripts(report, repository, options);
checkSkillScriptBehavior(report, repository, options);
checkGitWhitespace(report, repository, options);

if (values['self-test']) runSelfTest(report, repository);

const counts = report.counts();
console.log(`SUMMARY PASS=${counts.PASS} FAIL=${counts.FAIL} WARN=${counts.WARN} UNRUN=${counts.UNRUN}`);
process.exit(counts.FAIL > 0 ? 1 : 0);
