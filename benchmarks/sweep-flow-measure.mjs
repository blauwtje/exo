import fs from 'node:fs';
import { buildPhases } from './build-phases.mjs';
import { commentStats, ledgerTranscripts } from './comment-count.mjs';
import { checkFlow } from './flow-check.mjs';
import { gateFacts, readJsonl, reviewBookings, toolCalls } from './lean-gates-metrics.mjs';
import { FLOW_BRANCH } from './sweep-fixtures.mjs';
import { flowHelpers } from './sweep-prepare.mjs';
import { countDriftReports, reviewStages } from './sweep-score.mjs';
import { landedTasks } from './sweep-baseline.mjs';
import { newestRunLedger } from './value.mjs';

function flowTranscripts(repository, usage) {
  if (usage?.transcript) return [usage.transcript];
  return ledgerTranscripts(newestRunLedger(repository));
}

async function runFlowCheck(repository, helpers) {
  try {
    return await checkFlow(repository, helpers);
  } catch (error) {
    return { total: helpers.length, landed: null, pass: false, defects: [`flow check failed: ${error.message}`] };
  }
}

function tokensExcludingReview(phases) {
  if (phases === null) return null;
  const kept = Object.entries(phases).filter(([name]) => name !== 'review' && name !== 'fix');
  return Math.round(kept.reduce((sum, [, value]) => sum + value, 0));
}

function describeFlow({ check, helpers, trailers, transcript, review, stages, tokensExReview }) {
  const landed = check.landed === null ? 'unknown' : `${check.landed}/${check.total}`;
  return `${landed} tasks landed (${trailers}/${helpers.length} Plan-task trailers), hidden check ${check.pass ? 'pass' : 'fail'}, ${countDriftReports(transcript)} drift reports, review verdict ${review.verdict ?? 'none'}, review stages ${stages.reviewBranch} review-branch ${stages.fixReview} fix-review (fix=${stages.fix ?? '-'} concern=${stages.concern ?? '-'}), tokens excl. review and fix ${tokensExReview ?? '-'}`;
}

export async function measureFlow({ cell, repository, review, usage }) {
  const helpers = flowHelpers(cell);
  const transcript = usage?.transcript ? fs.readFileSync(usage.transcript, 'utf8') : '';
  const calls = usage?.transcript ? toolCalls(readJsonl(usage.transcript)) : null;
  const gates = calls === null ? null : gateFacts(calls);
  const check = await runFlowCheck(repository, helpers);
  const stages = reviewStages(usage?.subagents, transcript);
  const tokensExReview = tokensExcludingReview(usage?.transcript ? buildPhases(usage.transcript) : null);
  const trailers = landedTasks(repository);
  return {
    defectsFound: review.counts === null ? null : review.counts.defect,
    falseAlarms: null,
    detail: describeFlow({ check, helpers, trailers, transcript, review, stages, tokensExReview }),
    landed: check.landed,
    total: check.total,
    hiddenPass: check.pass,
    trailers,
    defects: check.defects,
    verifyRan: gates?.verifyRan ?? null,
    reviewDispatched: gates?.reviewDispatched ?? null,
    routes: gates?.routes ?? null,
    reviewBookings: calls === null ? null : reviewBookings(calls),
    leadPeakTokens: usage?.leadPeakTokens ?? null,
    hopPeakTokens: usage?.hopPeakTokens ?? null,
    reviewStages: stages,
    tokensExReview,
    commentStats: commentStats({ repository, branch: FLOW_BRANCH, transcripts: flowTranscripts(repository, usage), hiddenPass: check.pass })
  };
}
