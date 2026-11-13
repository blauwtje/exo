import { checkPluginVersion } from './checks/plugin-version.mjs';
import { checkModelKinds } from './checks/model-kinds.mjs';
import { checkForkSkillTier } from './checks/fork-skill-tier.mjs';
import { checkCodexOverrides } from './checks/codex-overrides.mjs';
import { checkHarnessCapabilities } from './checks/harness-capabilities.mjs';
import { checkQuestionOptions } from './checks/question-options.mjs';
import { checkEditEvidence } from './checks/edit-evidence.mjs';
import { checkScriptHelp } from './checks/script-help.mjs';
import { checkSkillLint } from './checks/skill-lint.mjs';

export function runLateChecks(report, repository, staticOnly) {
  if (!staticOnly) checkPluginVersion(report, repository);
  checkModelKinds(report, repository);
  checkForkSkillTier(report, repository);
  checkCodexOverrides(report, repository);
  checkHarnessCapabilities(report, repository);
  checkQuestionOptions(report, repository);
  checkEditEvidence(report, repository);
  checkScriptHelp(report, repository);
  checkSkillLint(report, repository);
}
