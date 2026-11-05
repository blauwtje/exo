

export class LandingError extends Error {
  kind = 'proof failed';
}

export class PlanDriftError extends LandingError {
  kind = 'plan drift';
}

export class CodeRuleError extends LandingError {
  kind = 'code rule';
}

export class EnvError extends LandingError {
  kind = 'env';
}

export class ReportMissingError extends LandingError {
  kind = 'report missing';
}

export class OutsideFilesError extends LandingError {
  kind = 'outside Files';
}
