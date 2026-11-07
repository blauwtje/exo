import fs from 'node:fs';

export const MATCHED_EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest'];

export function unmatchedGroups(hooksConfig) {
  return Object.entries(hooksConfig.hooks ?? {})
    .filter(([event]) => MATCHED_EVENTS.includes(event))
    .flatMap(([event, groups]) => groups.filter((group) => !group.matcher || group.matcher === '*').map(() => event));
}

export function checkHookMatchers(report, repository) {
  const unmatched = unmatchedGroups(JSON.parse(fs.readFileSync(repository.join('hooks', 'hooks.json'), 'utf8')));
  if (unmatched.length > 0) {
    report.result('FAIL', 'hook matchers', `${unmatched.length} hooks.json group(s) on ${[...new Set(unmatched)].join(', ')} have no matcher and would spawn on every tool call; add a matcher naming the tools`);
    return;
  }
  report.result('PASS', 'hook matchers', 'every tool-event hook group in hooks/hooks.json names its tools');
}
