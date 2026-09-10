// The corpus contract as data: which skills must exist and what frontmatter may say.

export const EXPECTED_SKILLS = [
  'debug', 'deepen', 'designing', 'implementing', 'implementing-batch', 'planning', 'research', 'shaping', 'skills-tool'
];

export const EXPECTED_SKILL_PATHS = EXPECTED_SKILLS.map((name) => `skills/${name}/SKILL.md`);

export const ALLOWED_EFFORT = ['low', 'medium', 'high', 'xhigh', 'max'];
export const ALLOWED_MODEL = ['sonnet', 'opus', 'haiku', 'fable', 'inherit'];
