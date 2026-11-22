import { parsePlan } from './plan-tasks.mjs';

export function openPoints(planText) {
  const section = parsePlan(planText).frame['Open points'] ?? '';
  return section.split('\n').flatMap((line) => line.match(/^\s*(?:[-*]|\d+\.)\s+(.+)$/)?.[1].trim() ?? []);
}

function bullets(text) {
  return text.split('\n').flatMap((line) => {
    if (line.startsWith('- ')) return line.slice(2);
    return /^\d+\. /.test(line) ? line : [];
  });
}

export function frameOf(frame) {
  const basis = frame['Plan basis'] ?? '';
  return {
    goal: frame.Goal ?? '',
    successCriterion: frame['Success criterion'] ?? null,
    repository: basis.match(/^Repository: (.+)$/m)?.[1] ?? null,
    branch: basis.match(/^Branch: (.+)$/m)?.[1] ?? null,
    worktreeSetup: basis.match(/^Worktree setup: (.+)$/m)?.[1] ?? null,
    landGate: basis.match(/^Land gate: (.+)$/m)?.[1] ?? null,
    moves: [...basis.matchAll(/^Moved: (.+?) -> (.+)$/gm)].map(([, source, dest]) => ({ source: source.trim(), dest: dest.trim() })),
    nonGoals: bullets(frame['Non-goals'] ?? ''),
    context: bullets(frame.Context ?? ''),
    decisions: bullets(frame.Decisions ?? ''),
    assumptions: bullets(frame.Assumptions ?? ''),
    visualDirection: frame['Visual direction'] ?? null,
    reviewFocus: frame['Review Focus'] ?? null
  };
}
