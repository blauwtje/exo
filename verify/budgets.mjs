// The corpus contract as data: which skills must exist, what frontmatter may say,
// and the per-file ceilings. Line ceilings are per file for the same reason
// character ceilings are: a worked artifact carries grammar that costs lines, not
// words. Every file not named here keeps 120 for a SKILL.md and 90 for a reference.

export const EXPECTED_SKILLS = [
  'debug', 'deepen', 'designing', 'implementing-batch', 'planning', 'research', 'shaping'
];

export const EXPECTED_SKILL_PATHS = EXPECTED_SKILLS.map((name) => `skills/${name}/SKILL.md`);

export const ALLOWED_EFFORT = ['low', 'medium', 'high', 'xhigh', 'max'];
export const ALLOWED_MODEL = ['sonnet', 'opus', 'haiku', 'fable', 'inherit'];

export const CHARACTER_BUDGETS = {
  'skills/designing/SKILL.md': 19600,
  'skills/designing/references/motion.md': 9200,
  'skills/designing/references/visual-direction.md': 10000
};

export const LINE_BUDGETS = {
  'skills/planning/references/example-handoff.md': 160,
  'skills/designing/references/craft-recipes.md': 110
};

export const DEFAULT_SKILL_LINES = 120;
export const DEFAULT_REFERENCE_LINES = 90;
