import { createExecutionEvidence } from './authority-evidence.js';

export class AuthorityDeniedError extends Error {
  constructor({ result, receipt }) {
    super(result?.reason || 'action denied by Agent Authority');
    this.name = 'AuthorityDeniedError';
    this.code = result?.code || 'authority_denied';
    this.result = result;
    this.receipt = receipt;
  }
}

export class AuthorityApprovalRequiredError extends Error {
  constructor({ result, receipt }) {
    super(result?.reason || 'human approval required by Agent Authority');
    this.name = 'AuthorityApprovalRequiredError';
    this.code = result?.code || 'approval_required';
    this.result = result;
    this.receipt = receipt;
  }
}

/**
 * Minimal protocol-neutral enforcement wrapper.
 *
 * Put the side effect inside run(). The callback is invoked only after the
 * authority boundary returns ALLOW. A guard can use either a static mission or
 * a TaskLease. Task leases add provenance-bound restrictions without changing
 * the host application's credential ownership.
 *
 * Successful effects also return execution evidence binding the exact output
 * hash to the ALLOW receipt. TaskLease.deriveFromEvidence() can use that record
 * with a trusted adapter extractor so callers do not provide derived values.
 */
export class AuthorityGuard {
  constructor({ mission, lease, runtime, onDecision } = {}) {
    if ((mission && lease) || (!mission && !lease)) {
      throw new Error('provide exactly one of mission or lease');
    }
    if (lease && typeof lease.evaluate !== 'function') throw new Error('lease must implement evaluate(runtime, request)');
    if (!runtime || typeof runtime.evaluate !== 'function') throw new Error('authority runtime is required');
    if (onDecision !== undefined && typeof onDecision !== 'function') throw new Error('onDecision must be a function');
    this.mission = mission || null;
    this.lease = lease || null;
    this.runtime = runtime;
    this.onDecision = onDecision || null;
  }

  evaluate(request) {
    const evaluation = this.lease
      ? this.lease.evaluate(this.runtime, request)
      : this.runtime.evaluate(this.mission, request);
    if (this.onDecision) this.onDecision(evaluation, request);
    return evaluation;
  }

  async run(request, effect) {
    if (typeof effect !== 'function') throw new Error('effect callback is required');
    const evaluation = this.evaluate(request);

    if (evaluation.result.decision === 'deny') {
      throw new AuthorityDeniedError(evaluation);
    }
    if (evaluation.result.decision === 'require_approval') {
      throw new AuthorityApprovalRequiredError(evaluation);
    }
    if (evaluation.result.decision !== 'allow') {
      throw new AuthorityDeniedError({
        ...evaluation,
        result: { ...evaluation.result, code: 'unknown_decision', reason: 'authority returned an unsupported decision' }
      });
    }

    const output = await effect();
    const evidence = createExecutionEvidence({ receipt: evaluation.receipt, output });
    return { output, result: evaluation.result, receipt: evaluation.receipt, evidence };
  }
}

export function createAuthorityGuard(options) {
  return new AuthorityGuard(options);
}

export function createTaskLeaseGuard({ lease, ...options } = {}) {
  return new AuthorityGuard({ ...options, lease });
}
