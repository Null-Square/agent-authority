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
    this.code = 'approval_required';
    this.result = result;
    this.receipt = receipt;
  }
}

/**
 * Minimal protocol-neutral enforcement wrapper.
 *
 * Put the side effect inside run(). The callback is invoked only after the
 * mission evaluates to ALLOW. DENY and REQUIRE_APPROVAL never execute it.
 * Credentials remain owned by the host application/provider SDK.
 */
export class AuthorityGuard {
  constructor({ mission, runtime, onDecision } = {}) {
    if (!mission) throw new Error('mission is required');
    if (!runtime || typeof runtime.evaluate !== 'function') throw new Error('authority runtime is required');
    if (onDecision !== undefined && typeof onDecision !== 'function') throw new Error('onDecision must be a function');
    this.mission = mission;
    this.runtime = runtime;
    this.onDecision = onDecision || null;
  }

  evaluate(request) {
    const evaluation = this.runtime.evaluate(this.mission, request);
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
    return { output, result: evaluation.result, receipt: evaluation.receipt };
  }
}

export function createAuthorityGuard(options) {
  return new AuthorityGuard(options);
}
