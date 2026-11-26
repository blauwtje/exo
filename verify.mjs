
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { createReport } from './verify/report.mjs';
import { createRepository } from './verify/repository.mjs';
import { checkSkillFrontmatter } from './verify/checks/skill-frontmatter.mjs';
import { checkSkillSections } from './verify/checks/skill-sections.mjs';
import { checkMarkdownReferences } from './verify/checks/markdown-references.mjs';
import { checkPluginValidate } from './verify/checks/plugin-validate.mjs';
import { checkReferenceSplit } from './verify/checks/reference-split.mjs';
import { checkScriptSyntax } from './verify/checks/script-syntax.mjs';
import { checkHookSet } from './verify/checks/hook-set.mjs';
import { checkPrincipleCitations } from './verify/checks/principle-citations.mjs';
import { checkSilentCatch } from './verify/checks/silent-catch.mjs';
import { checkInvisibleUnicode } from './verify/checks/invisible-unicode.mjs';
import { checkPersonalPaths } from './verify/checks/personal-paths.mjs';
import { startSkillScriptBehavior } from './verify/checks/skill-script-behavior.mjs';
import { checkScriptOptions } from './verify/checks/script-options.mjs';
import { checkPositionalLiterals } from './verify/checks/positional-literals.mjs';
import { checkTestTiming } from './verify/checks/test-timing.mjs';
import { checkImportDirection } from './verify/checks/import-direction.mjs';
import { checkFileSize } from './verify/checks/file-size.mjs';
import { checkModelRouting } from './verify/checks/model-routing.mjs';
import { checkPluginVersion } from './verify/checks/plugin-version.mjs';

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
checkSkillSections(report, repository);
checkMarkdownReferences(report, repository);
checkPluginValidate(report, repository);
checkReferenceSplit(report, repository);
checkScriptSyntax(report, repository);
checkHookSet(report, repository);
checkPrincipleCitations(report, repository);
checkSilentCatch(report, repository);
checkInvisibleUnicode(report, repository);
checkPersonalPaths(report, repository);
checkScriptOptions(report, repository);
checkPositionalLiterals(report, repository);
checkTestTiming(report, repository);
checkImportDirection(report, repository);
checkFileSize(report, repository);
checkModelRouting(report, repository);
if (behavior) {
  const outcome = await behavior;
  report.result(outcome.status, outcome.name, outcome.detail);
}
if (!values.static) checkPluginVersion(report, repository);

const counts = report.counts();
console.log(`SUMMARY PASS=${counts.PASS} FAIL=${counts.FAIL} WARN=${counts.WARN} UNRUN=${counts.UNRUN}`);
process.exit(counts.FAIL > 0 ? 1 : 0);
