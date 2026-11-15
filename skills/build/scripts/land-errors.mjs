export class LandingError extends Error {}

export class ReportMissingError extends LandingError {}

export class RefusedError extends LandingError {}

export class AlreadyLandedError extends LandingError {}

export class LockHeldError extends LandingError {}

export class UnfinishedMergeError extends LandingError {}
