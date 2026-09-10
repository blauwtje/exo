// Port of Test-EvalCases (verify.ps1:863-1232): every case in evals/cases.json
// satisfies the routing, gate, fixture and observation contracts, and every
// derivable expectation matches its oracle.
//
// The check collects every violation into one list and reports a single line, so a
// broken corpus names all of its faults in one run rather than one per run.

import fs from 'node:fs';
import {
  FIXTURE_MEASURE_FILE,
  FIXTURE_PROOF_COMMAND,
  FIXTURE_SCRIPT_EXTENSION,
  FIXTURE_TEST_FILE,
  oracleFirstSkill,
  oracleRequestSize,
  oracleVisualVerification
} from '../oracles.mjs';
import { parseFixtureScripts } from '../fixture-syntax.mjs';

const EXPECTED_CASE_COUNT = 30;
const MUNDANE_CASE_COUNT = 5;

// The routing contract: the ordered skill route each named case must expect.
const ROUTES = new Map([
  ['fix-this', ['direct']],
  ['feels-slow', ['debug', 'implementing-batch']],
  ['dashboard-nicer', ['designing', 'direct-report']],
  ['settings-page', ['shaping', 'designing', 'shaping', 'implementing-batch']],
  ['implement-auth', ['shaping', 'planning', 'implementing-batch']],
  ['research-migration', ['implementing-batch', 'research', 'implementing-batch']],
  ['one-file-typo', ['direct']],
  ['one-file-rename', ['direct']],
  ['read-only-question', ['direct']],
  ['version-only-bump', ['direct']],
  ['git-operation', ['direct']],
  ['multi-file-typo', ['implementing-batch']],
  ['multi-file-rename', ['implementing-batch']],
  ['unproven-failure', ['debug', 'implementing-batch']],
  ['proven-failure', ['implementing-batch']],
  ['explicit-handoff', ['planning']],
  ['planning-mode-route', ['planning']],
  ['shaping-ui-overlap', ['shaping', 'designing', 'shaping', 'implementing-batch']],
  ['security-boundary', ['implementing-batch']],
  ['data-migration-boundary', ['planning', 'implementing-batch']],
  ['test-design-boundary', ['implementing-batch']],
  ['shaping-explore', ['shaping']],
  ['ui-tweak', ['designing', 'direct-report']],
  ['ambiguous-referent', ['direct']],
  ['forced-breaker', ['debug']],
  ['architecture-audit', ['deepen']],
  ['architecture-plan', ['deepen']],
  ['refactor-named-change', ['implementing-batch']],
  ['dashboard-still-empty', ['designing', 'direct-report']],
  ['module-bounded-redesign', ['designing', 'direct-report']]
]);

const UI_REFERENCES = ['composition.md', 'controls.md', 'implementation.md', 'interaction-qa.md', 'motion.md', 'typography.md', 'visual-critique.md', 'visual-direction.md'];
const UI_REFERENCES_ALWAYS = ['composition.md', 'controls.md', 'implementation.md', 'interaction-qa.md', 'motion.md', 'visual-critique.md', 'visual-direction.md'];
const REQUIRED_EXPECTED_KEYS = ['firstSkill', 'orderedRoute', 'references', 'referencePhases', 'maxQuestionsBeforeCode', 'editPolicy', 'artifactPolicy', 'proof', 'breaker', 'freshEyes', 'requestSize', 'visualVerification', 'allowedEditPaths', 'requiredChangedPaths', 'requiredAnyChangedPaths', 'pathAssertions', 'verificationCommands'];
const ALLOWED_REFERENCE_PHASES = ['before-measurement', 'after-inspection-before-ordering', 'after-baseline-before-affected-edit', 'after-prediction-before-affected-edit', 'after-reproduction-before-affected-edit', 'after-proof', 'cold-handoff', 'visual-grounding', 'before-visual-code', 'visual-review'];
const REQUIRED_OBSERVATION_FIELDS = ['first_skill', 'downstream_handoffs', 'questions_before_code', 'turns_before_first_edit', 'artifacts_created', 'proof_classification', 'breaker_behavior', 'fresh_eyes', 'verification_evidence', 'references_loaded', 'request_size', 'visual_verification', 'render_artifacts', 'motion_evidence', 'faults_fixed', 'post_render_revision'];

const RENDER_VIEWPORTS = '390,1440';
const RENDER_PHASES = 'baseline,post-build,final';

// PowerShell casts a missing or null property to the empty string before comparing.
function text(value) {
  return value === null || value === undefined ? '' : String(value);
}

function list(value) {
  if (Array.isArray(value)) return value;
  return value === null || value === undefined ? [] : [value];
}

function number(value) {
  return typeof value === 'number' ? value : 0;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

// Compare-Object reports a difference whenever the two sides are not the same
// multiset; order carries no meaning on either side.
function sameContents(left, right) {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function isUnsafePath(value) {
  const candidate = text(value);
  const rooted = /^([a-zA-Z]:[\\/]|[\\/])/.test(candidate);
  return rooted || /(^|[\\/])\.\.([\\/]|$)/.test(candidate);
}

function requiredPhaseFor(reference, firstSkill) {
  const afterDebugEdit = firstSkill === 'debug';
  switch (reference) {
    case 'performance.md': return 'before-measurement';
    case 'critique.md': return 'after-proof';
    case 'security.md': return afterDebugEdit ? 'after-prediction-before-affected-edit' : 'after-baseline-before-affected-edit';
    case 'data-migration.md': return afterDebugEdit ? 'after-prediction-before-affected-edit' : 'after-inspection-before-ordering';
    case 'test-design.md': return afterDebugEdit ? 'after-reproduction-before-affected-edit' : 'after-baseline-before-affected-edit';
    case 'handoff-spec.md': return 'cold-handoff';
    case 'composition.md': return 'visual-grounding';
    case 'visual-direction.md': return 'visual-grounding';
    case 'typography.md': return 'visual-grounding';
    case 'controls.md': return 'before-visual-code';
    case 'implementation.md': return 'before-visual-code';
    case 'interaction-qa.md': return 'before-visual-code';
    case 'motion.md': return 'before-visual-code';
    case 'visual-critique.md': return 'visual-review';
    default: return '';
  }
}

// The file set a case's harness would see: the shared fixture, then the case's own
// setup operations applied in order.
function effectiveFilesFor(fixtureFiles, setup, caseId, replacementErrors) {
  const files = new Map();
  for (const fixtureFile of fixtureFiles) files.set(text(fixtureFile.path), text(fixtureFile.content));
  for (const operation of list(setup)) {
    const operationPath = text(operation.path);
    if (operation.operation === 'create') {
      files.set(operationPath, text(operation.content));
      continue;
    }
    if (operation.operation !== 'replace') continue;
    const oldText = text(operation.old);
    const current = files.get(operationPath);
    if (current === undefined || oldText === '' || !current.includes(oldText)) {
      replacementErrors.push(`${caseId}: setup replacement source is absent in ${operationPath}`);
    } else {
      files.set(operationPath, current.split(oldText).join(text(operation.new)));
    }
  }
  return files;
}

function checkRenderContract(errors, testCase, caseFilePaths) {
  const renderContract = testCase.expected.renderContract ?? null;
  const expectedVisual = text(testCase.expected.visualVerification);
  if (expectedVisual !== 'rendered') {
    if (renderContract !== null) {
      errors.push(`${testCase.id}: renderContract is only allowed when visual verification is rendered`);
    }
    return;
  }
  if (renderContract === null) {
    errors.push(`${testCase.id}: rendered visual verification requires a renderContract`);
    return;
  }
  const contractPaths = [text(renderContract.surface), ...list(renderContract.sourceInputs)];
  for (const contractPath of contractPaths) {
    if (text(contractPath).trim() === '' || isUnsafePath(contractPath) || !caseFilePaths.includes(contractPath)) {
      errors.push(`${testCase.id}: renderContract path '${text(contractPath)}' is not an in-fixture case file`);
    }
  }
  if (list(renderContract.viewports).join(',') !== RENDER_VIEWPORTS) {
    errors.push(`${testCase.id}: renderContract viewports must be exactly 390 and 1440`);
  }
  if (list(renderContract.phases).join(',') !== RENDER_PHASES) {
    errors.push(`${testCase.id}: renderContract phases must be exactly baseline, post-build, final`);
  }
}

// Which references a case must load follows from its facts and its route, so a
// hand-edited reference list cannot quietly drop the gate that produced it.
function checkReferenceExpectations(errors, testCase) {
  const { facts, expected } = testCase;
  const references = list(expected.references);
  const route = list(expected.orderedRoute);
  const buildingRoute = route.includes('implementing-batch') || route.includes('debug');

  const needsTestDesign = Boolean(facts.logicOrPublicBehavior) && Boolean(facts.testRunner) && buildingRoute;
  const needsCritique = buildingRoute && (number(facts.changedFileCount) > 1
    || Boolean(facts.newDependency)
    || Boolean(facts.publicSignature)
    || Boolean(facts.userVisible)
    || Boolean(facts.requiredFileUninspected));
  const needsPerformance = Boolean(facts.speedOnly) && buildingRoute;
  const needsHandoff = Boolean(facts.explicitPlan) || Boolean(facts.differentExecutor);

  if ((list(facts.securityBoundaries).length > 0) !== references.includes('security.md')) {
    errors.push(`${testCase.id}: security reference expectation disagrees with boundary facts`);
  }
  if ((list(facts.migrationBoundaries).length > 0) !== references.includes('data-migration.md')) {
    errors.push(`${testCase.id}: data-migration expectation disagrees with boundary facts`);
  }
  if (needsTestDesign !== references.includes('test-design.md')) {
    errors.push(`${testCase.id}: test-design expectation disagrees with logic/test-runner facts`);
  }
  if (needsCritique !== references.includes('critique.md')) {
    errors.push(`${testCase.id}: critique expectation disagrees with route/size facts`);
  }
  if (needsPerformance !== references.includes('performance.md')) {
    errors.push(`${testCase.id}: performance expectation disagrees with speed/debug facts`);
  }
  if (needsHandoff !== references.includes('handoff-spec.md')) {
    errors.push(`${testCase.id}: handoff expectation disagrees with executor facts`);
  }
  if (Boolean(facts.researchRequired) !== route.includes('research')) {
    errors.push(`${testCase.id}: research route element disagrees with the researchRequired fact`);
  }
  if (Boolean(facts.breakerForced) !== (text(expected.breaker) === 'two-attempt-stop')) {
    errors.push(`${testCase.id}: required two-attempt breaker disagrees with the breakerForced fact`);
  }
  if (number(expected.minQuestionsBeforeCode) > number(expected.maxQuestionsBeforeCode)) {
    errors.push(`${testCase.id}: minQuestionsBeforeCode exceeds maxQuestionsBeforeCode`);
  }

  const expectedUiReferences = references.filter((reference) => UI_REFERENCES.includes(reference));
  const ownsUi = route.includes('designing') && !facts.uiTweakOnly;
  const requiredUiReferences = ownsUi
    ? [...UI_REFERENCES_ALWAYS, ...(facts.setsTypography ? ['typography.md'] : [])]
    : [];
  if (!sameContents(requiredUiReferences, expectedUiReferences)) {
    errors.push(`${testCase.id}: UI reference expectation disagrees with UI ownership/surface facts`);
  }
}

function checkExpectedShape(errors, testCase) {
  const { expected } = testCase;
  for (const requiredKey of REQUIRED_EXPECTED_KEYS) {
    if (!(requiredKey in expected)) errors.push(`${testCase.id}: missing expected.${requiredKey}`);
  }
  const references = list(expected.references);
  const phases = expected.referencePhases ?? {};
  if (!sameContents(references, Object.keys(phases))) {
    errors.push(`${testCase.id}: referencePhases keys must equal expected references`);
  }
  for (const phase of Object.values(phases)) {
    if (!ALLOWED_REFERENCE_PHASES.includes(phase)) {
      errors.push(`${testCase.id}: unsupported reference phase '${text(phase)}'`);
    }
  }
  const firstSkill = expected.firstSkill ?? null;
  for (const reference of references) {
    const requiredPhase = requiredPhaseFor(reference, firstSkill);
    if (text(phases[reference]) !== requiredPhase) {
      errors.push(`${testCase.id}: ${reference} phase must be '${requiredPhase}'`);
    }
  }
}

// Every path a case names must be inside the fixture, allowed for editing, and
// backed by an assertion, so an outcome cannot be claimed without being observed.
function checkCasePaths(errors, testCase, outcomePaths) {
  const { expected } = testCase;
  for (const operation of list(testCase.setup)) {
    if (!['replace', 'create'].includes(operation.operation)) {
      errors.push(`${testCase.id}: unsupported setup operation '${text(operation.operation)}'`);
    }
    if (isUnsafePath(operation.path)) {
      errors.push(`${testCase.id}: unsafe setup path '${text(operation.path)}'`);
    }
  }
  const allowedPaths = list(expected.allowedEditPaths);
  for (const pathSet of [allowedPaths, list(expected.requiredChangedPaths), list(expected.requiredAnyChangedPaths)]) {
    if (uniqueSorted(pathSet).length !== pathSet.length) {
      errors.push(`${testCase.id}: expected path lists must not contain duplicates`);
    }
    for (const candidate of pathSet) {
      if (isUnsafePath(candidate)) errors.push(`${testCase.id}: unsafe expected path '${text(candidate)}'`);
    }
  }
  if (outcomePaths.some((outcomePath) => !allowedPaths.includes(outcomePath))) {
    errors.push(`${testCase.id}: required outcome paths must be allowed edit paths`);
  }
  const readOnly = text(expected.editPolicy) === 'no-edit';
  if (readOnly && outcomePaths.length > 0) {
    errors.push(`${testCase.id}: read-only case cannot require changed paths`);
  } else if (!readOnly && outcomePaths.length === 0 && text(expected.breaker) !== 'two-attempt-stop') {
    errors.push(`${testCase.id}: edit case needs a required path or one-of path set`);
  }
  for (const assertion of list(expected.pathAssertions)) {
    const assertionPath = text(assertion.path);
    if (assertionPath.trim() === '' || !outcomePaths.includes(assertionPath)) {
      errors.push(`${testCase.id}: path assertion must target a required outcome path`);
    }
    if ((assertion.contains ?? null) === null && (assertion.notContains ?? null) === null) {
      errors.push(`${testCase.id}: path assertion needs contains or notContains`);
    }
  }
  const assertedPaths = uniqueSorted(list(expected.pathAssertions).map((assertion) => text(assertion.path)));
  const missingAssertions = outcomePaths.filter((outcomePath) => !assertedPaths.includes(outcomePath));
  if (missingAssertions.length > 0) {
    errors.push(`${testCase.id}: required outcome paths lack substantive assertions: ${missingAssertions.join(', ')}`);
  }
}

// A verified case must prove itself with a fixture-local command that actually
// reads the paths it claims to change; anything else is proof by assertion.
function checkProofCommands(errors, testCase, outcomePaths, effectiveFiles) {
  const { expected } = testCase;
  const commands = list(expected.verificationCommands).map((command) => text(command).trim());
  if (commands.some((command) => command === '') || uniqueSorted(commands).length !== commands.length) {
    errors.push(`${testCase.id}: verification commands must be non-empty and unique`);
  }
  const verified = text(expected.proof) === 'verified';
  if (verified && commands.length === 0) {
    errors.push(`${testCase.id}: verified proof needs at least one case proof command`);
  } else if (!verified && commands.length > 0) {
    errors.push(`${testCase.id}: non-verified proof cannot prescribe a case proof command`);
  }
  const measurementCommand = text(expected.measurementCommand);
  const allowedCommands = [FIXTURE_PROOF_COMMAND];
  if (measurementCommand.trim() !== '') allowedCommands.push(measurementCommand);
  if (commands.some((command) => !allowedCommands.includes(command))) {
    errors.push(`${testCase.id}: verification command is not a dependency-free fixture oracle`);
  }

  const oracleContent = commands
    .map((command) => {
      if (command === FIXTURE_PROOF_COMMAND) return text(effectiveFiles.get(FIXTURE_TEST_FILE));
      if (command === measurementCommand) return text(effectiveFiles.get(FIXTURE_MEASURE_FILE));
      return null;
    })
    .filter((content) => content !== null)
    .join('\n');
  if (!verified) return;
  for (const outcomePath of outcomePaths.filter((candidate) => candidate !== FIXTURE_TEST_FILE)) {
    if (!oracleContent.includes(outcomePath.replaceAll('\\', '/'))) {
      errors.push(`${testCase.id}: case proof command does not exercise required path ${outcomePath}`);
    }
  }
}

function checkRouteAndOracles(errors, testCase, route) {
  const caseId = testCase.id;
  const { expected, facts } = testCase;
  const actualRoute = list(expected.orderedRoute);
  if (actualRoute.join(' > ') !== route.join(' > ')) {
    errors.push(`${caseId}: ordered route differs from the routing contract`);
  }
  if (actualRoute[0] === 'shaping') {
    const artifactPolicy = text(expected.artifactPolicy);
    if (text(expected.editPolicy) !== 'no-edit' && artifactPolicy !== 'docs/specs/') {
      errors.push(`${caseId}: shaping-first edit route must declare a docs/specs/ brief artifact`);
    } else if (text(expected.editPolicy) === 'no-edit' && artifactPolicy !== 'none') {
      errors.push(`${caseId}: shaping Explore route must not declare a brief artifact`);
    }
  }

  const expectedFirst = expected.firstSkill ?? null;
  const derivedFirst = oracleFirstSkill(facts);
  if (derivedFirst !== expectedFirst) {
    errors.push(`${caseId}: first skill '${text(expectedFirst)}' disagrees with predicate oracle '${text(derivedFirst)}'`);
  }
  const derivedSize = oracleRequestSize(facts);
  const expectedSize = text(expected.requestSize);
  if (derivedSize !== expectedSize) {
    errors.push(`${caseId}: request size '${expectedSize}' disagrees with predicate oracle '${derivedSize}'`);
  }
  const derivedVisual = oracleVisualVerification(derivedSize);
  const expectedVisual = text(expected.visualVerification);
  if (derivedVisual !== null && derivedVisual !== expectedVisual) {
    errors.push(`${caseId}: visual verification '${expectedVisual}' disagrees with size-derived oracle '${derivedVisual}'`);
  }
}

function checkObservationSchema(errors, observationSchema) {
  if (!sameContents(REQUIRED_OBSERVATION_FIELDS, list(observationSchema?.required))) {
    errors.push('observation schema does not require every requested behavioral field');
  }
  const breakerRequired = list(observationSchema?.properties?.breaker_behavior?.required);
  if (!sameContents(['state', 'evidence'], breakerRequired)) {
    errors.push('observation schema must structure breaker state and evidence');
  }
}

// The file set each case's harness would see, plus the parse errors its scripts
// produce. Both are derived once for the whole corpus: parsing costs one parser
// process here instead of one per case.
function prepareFixtures(cases, fixtureFiles) {
  const replacementErrors = new Map();
  const effectiveByCase = new Map();
  for (const testCase of cases) {
    const caseErrors = [];
    effectiveByCase.set(testCase.id, effectiveFilesFor(fixtureFiles, testCase.setup, testCase.id, caseErrors));
    replacementErrors.set(testCase.id, caseErrors);
  }
  const scriptBodies = [];
  for (const files of effectiveByCase.values()) {
    for (const [filePath, content] of files) {
      if (filePath.toLowerCase().endsWith(FIXTURE_SCRIPT_EXTENSION)) scriptBodies.push(content);
    }
  }
  return { effectiveByCase, replacementErrors, parseErrorsByBody: parseFixtureScripts(scriptBodies) };
}

// The two cases that exist to prove a multi-file change: each needs its token in
// two fixture files and both files named as observable outcomes.
function checkMultiFileCases(errors, cases, fixtureFiles) {
  const multiTypo = cases.find((testCase) => testCase.id === 'multi-file-typo');
  const multiRename = cases.find((testCase) => testCase.id === 'multi-file-rename');
  if (uniqueSorted(list(multiTypo?.setup).map((operation) => text(operation.path))).length < 2) {
    errors.push('multi-file-typo must place the correction in at least two files');
  }
  const renameFrom = text(multiRename?.facts?.renameFrom);
  const renamePaths = uniqueSorted(fixtureFiles
    .filter((fixtureFile) => text(fixtureFile.content).includes(renameFrom))
    .map((fixtureFile) => text(fixtureFile.path)));
  if (renameFrom.trim() === '' || renamePaths.length < 2) {
    errors.push('multi-file-rename must place its source token in at least two fixture files');
  }
  if (list(multiTypo?.expected?.requiredChangedPaths).length < 2) {
    errors.push('multi-file-typo must require both corrections as observable outcomes');
  }
  if (list(multiRename?.expected?.requiredChangedPaths).length < 2) {
    errors.push('multi-file-rename must require both files as observable outcomes');
  }
}

export function checkEvalCases(report, repository) {
  const casesPath = repository.join('evals', 'cases.json');
  let data;
  try {
    data = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  } catch (error) {
    report.result('FAIL', 'evaluation cases', `cases.json is invalid: ${error.message}`);
    return;
  }

  const errors = [];
  if (data.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  const cases = list(data.cases);
  if (cases.length !== EXPECTED_CASE_COUNT) {
    errors.push(`expected ${EXPECTED_CASE_COUNT} cases, found ${cases.length}`);
  }
  const ids = cases.map((testCase) => testCase.id);
  if (uniqueSorted(ids).length !== ids.length) errors.push('case ids must be unique');

  const fixtureFiles = list(data.fixture?.files);
  const fixturePaths = fixtureFiles.map((fixtureFile) => text(fixtureFile.path));
  const setupCreatePaths = (testCase) => list(testCase.setup)
    .filter((operation) => operation.operation === 'create')
    .map((operation) => text(operation.path));

  const fixtures = prepareFixtures(cases, fixtureFiles);

  for (const [caseId, route] of ROUTES) {
    const testCase = cases.find((candidate) => candidate.id === caseId);
    if (testCase === undefined) {
      errors.push(`missing required case ${caseId}`);
      continue;
    }
    checkRouteAndOracles(errors, testCase, route);
    checkRenderContract(errors, testCase, [...fixturePaths, ...setupCreatePaths(testCase)]);
    checkReferenceExpectations(errors, testCase);
    checkExpectedShape(errors, testCase);
  }

  const mundane = cases.filter((testCase) => list(testCase.tags).includes('mundane'));
  if (mundane.length !== MUNDANE_CASE_COUNT
    || mundane.some((testCase) => (testCase.expected.firstSkill ?? null) !== null)) {
    errors.push('exactly five mundane cases must expect zero skills');
  }

  if (uniqueSorted(fixturePaths).length !== fixturePaths.length) {
    errors.push('fixture file paths must be unique');
  }
  for (const fixturePath of fixturePaths) {
    if (isUnsafePath(fixturePath)) errors.push(`unsafe fixture path: ${fixturePath}`);
  }

  const baselineTests = text(fixtureFiles.find((fixtureFile) => text(fixtureFile.path) === FIXTURE_TEST_FILE)?.content);
  for (const testCase of cases) {
    const requiredPaths = list(testCase.expected.requiredChangedPaths);
    const outcomePaths = uniqueSorted([...requiredPaths, ...list(testCase.expected.requiredAnyChangedPaths)]);
    checkCasePaths(errors, testCase, outcomePaths);

    const logicWithRunner = Boolean(testCase.facts.logicOrPublicBehavior) && Boolean(testCase.facts.testRunner);
    const baselineCoversOutcome = requiredPaths.some((requiredPath) => baselineTests.includes(`./${requiredPath.replaceAll('\\', '/')}`));
    const setupTouchesTests = list(testCase.setup).some((operation) => text(operation.path) === FIXTURE_TEST_FILE);
    if (logicWithRunner && !setupTouchesTests && !requiredPaths.includes(FIXTURE_TEST_FILE) && !baselineCoversOutcome) {
      errors.push(`${testCase.id}: logic/public-behavior case has no executable test oracle`);
    }

    const effectiveFiles = fixtures.effectiveByCase.get(testCase.id);
    checkProofCommands(errors, testCase, outcomePaths, effectiveFiles);
    errors.push(...fixtures.replacementErrors.get(testCase.id));
    for (const [filePath, content] of effectiveFiles) {
      if (!filePath.toLowerCase().endsWith(FIXTURE_SCRIPT_EXTENSION)) continue;
      for (const message of fixtures.parseErrorsByBody.get(content) ?? []) {
        errors.push(`${testCase.id}: ${filePath} does not parse: ${message}`);
      }
    }
  }

  checkMultiFileCases(errors, cases, fixtureFiles);

  checkObservationSchema(errors, data.observationSchema);

  report.assert(
    errors.length === 0,
    'evaluation cases',
    `${cases.length} cases satisfy routing, gate, fixture, and observation contracts`,
    errors.join('; ')
  );
}
