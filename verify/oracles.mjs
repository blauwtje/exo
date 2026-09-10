// The expectations the corpus derives rather than hand-writes: a case states its
// facts, and these functions say what the route must be. A hand-written value that
// an oracle can derive is a second source of truth that drifts.
//
// Port of Get-OracleRequestSize, Get-OracleVisualVerification and
// Get-OracleFirstSkill (verify.ps1:775-861).

export const FIXTURE_TEST_FILE = 'tests.mjs';
export const FIXTURE_MEASURE_FILE = 'measure.mjs';
export const FIXTURE_PROOF_COMMAND = 'node tests.mjs';
export const FIXTURE_SCRIPT_EXTENSION = '.mjs';

function flag(facts, name) {
  return Boolean(facts?.[name]);
}

function count(facts, name) {
  const value = facts?.[name];
  return typeof value === 'number' ? value : 0;
}

export function oracleRequestSize(facts) {
  if (!flag(facts, 'visual')) return 'not-applicable';
  if (flag(facts, 'uiTweakOnly')) return 'tweak';
  if (flag(facts, 'boundedRedesign')) return 'bounded';
  if (flag(facts, 'newVisualSurface')) return 'full';
  return 'piece';
}

// Derived from the request size alone. Reading renderContract here would make the
// expectation prove itself; the contract's presence is checked against this result.
export function oracleVisualVerification(requestSize) {
  switch (requestSize) {
    case 'full': return 'rendered';
    case 'bounded': return 'rendered';
    case 'tweak': return 'not-applicable';
    case 'not-applicable': return 'not-applicable';
    default: return null;
  }
}

export function oracleFirstSkill(facts) {
  if (count(facts, 'referentCandidates') >= 2) return null;

  const fileCount = count(facts, 'changedFileCount');
  const versionOnly = flag(facts, 'versionOnlyBump');
  const apiMigration = flag(facts, 'apiMigration');
  const oneFileTextChange = fileCount <= 1 && (flag(facts, 'textOnly') || flag(facts, 'internalRename'));
  if (flag(facts, 'readOnly') || flag(facts, 'gitOnly') || (versionOnly && !apiMigration) || oneFileTextChange) {
    return null;
  }

  // Inside a read-only planning turn planning owns the turn ahead of debug, because nothing
  // is proven or edited there; an architecture audit is the one turn deepen keeps.
  if (flag(facts, 'planningMode')) {
    return flag(facts, 'architectureAudit') ? 'deepen' : 'planning';
  }

  if (flag(facts, 'existingFailure') && !flag(facts, 'causeProven')) return 'debug';
  if (flag(facts, 'architectureAudit')) return 'deepen';
  if (flag(facts, 'explicitPlan') || flag(facts, 'differentExecutor')) return 'planning';

  const size = fileCount > 1
    || flag(facts, 'newDependency')
    || flag(facts, 'publicSignature')
    || flag(facts, 'userVisible')
    || flag(facts, 'requiredFileUninspected');
  const undecided = !flag(facts, 'solutionChosen');
  if (undecided && (size || flag(facts, 'newVisualSurface') || flag(facts, 'explicitOptionsRequest'))) {
    return 'shaping';
  }
  if (flag(facts, 'visualOnly')) return 'designing';
  if (count(facts, 'dependencyEdges') >= 2) return 'planning';
  if (size) return 'implementing-batch';
  return null;
}
