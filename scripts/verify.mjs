
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { createReport } from './lib/report.mjs';
import { createRepository } from './lib/repository.mjs';
import { checkSkillFrontmatter } from './checks/skill-frontmatter.mjs';
import { checkAgentFrontmatter } from './checks/agent-frontmatter.mjs';
import { checkMarkdownReferences } from './checks/markdown-references.mjs';
import { checkPluginValidate } from './checks/plugin-validate.mjs';
import { checkScriptSyntax } from './checks/script-syntax.mjs';
import { checkInvisibleUnicode } from './checks/invisible-unicode.mjs';
import { checkPersonalPaths } from './checks/personal-paths.mjs';
import { checkPluginVersion } from './checks/plugin-version.mjs';
import { checkSkillSize } from './checks/skill-size.mjs';
import { checkPluginShape } from './checks/plugin-shape.mjs';
import { checkUnusedExports } from './checks/unused-exports.mjs';

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

const root = path.resolve(values['repository-root'] ?? path.resolve(import.meta.dirname, '..'));
if (!fs.existsSync(path.join(root, 'skills'))) {
  console.error(`skills/ not found at ${path.join(root, 'skills')}`);
  process.exit(1);
}

const report = createReport();
const repository = createRepository(root);

checkSkillFrontmatter(report, repository);
checkAgentFrontmatter(report, repository);
checkMarkdownReferences(report, repository);
checkPluginValidate(report, repository);
checkScriptSyntax(report, repository);
checkInvisibleUnicode(report, repository);
checkPersonalPaths(report, repository);
checkSkillSize(report, repository);
checkPluginShape(report, repository);
checkUnusedExports(report, repository);
if (!values.static) {
  checkPluginVersion(report, repository);
}

const counts = report.counts();
console.log(`SUMMARY PASS=${counts.PASS} FAIL=${counts.FAIL} WARN=${counts.WARN} UNRUN=${counts.UNRUN}`);
process.exit(counts.FAIL > 0 ? 1 : 0);
