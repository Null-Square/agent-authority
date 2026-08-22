import { AuthorityRuntime, createReceipt } from './index.js';
import { createExecutionEvidence } from './authority-evidence.js';

function executionFailure(mission, request, code, reason, extra = {}) {
  const result = { decision: 'deny', code, reason, ...extra };
  return { result, receipt: createReceipt({ mission, request, result }), output: null };
}

export class InMemoryUsageLedger {
  constructor() { this.spending = new Map(); }
  key(missionId, currency) { return `${missionId}\u0000${currency || 'UNSPECIFIED'}`; }
  spent(missionId, currency) { return this.spending.get(this.key(missionId, currency)) || 0; }
  record(missionId, currency, amount) {
    const next = this.spent(missionId, currency) + Number(amount);
    this.spending.set(this.key(missionId, currency), next);
    return next;
  }
}

/**
 * AuthorityRuntime variant that keeps credentials and authenticated execution
 * behind the authority boundary. The calling agent receives only sanitized
 * provider output, never the long-lived credential.
 */
export class ExecutingAuthorityRuntime extends AuthorityRuntime {
  constructor(options = {}) {
    super(options);
    this.usage = options.usage || new InMemoryUsageLedger();
    this.approvals = options.approvals || null;
    this.executions = options.executions || null;
  }

  cumulativeBudgetCheck(mission, request) {
    const budget = mission.constraints?.budget;
    if (!budget || request?.context?.amount === undefined) return null;

    const currency = request.context.currency || budget.currency;
    if (currency !== budget.currency) {
      return executionFailure(mission, request, 'budget_currency_mismatch', 'request currency does not match mission budget');
    }

    const amount = Number(request.context.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return executionFailure(mission, request, 'invalid_amount', 'request amount must be a non-negative finite number');
    }
    const alreadySpent = this.usage.spent(mission.mission_id, budget.currency);
    const nextTotal = alreadySpent + amount;
    if (nextTotal > Number(budget.amount)) {
      return executionFailure(
        mission,
        request,
        'cumulative_budget_exceeded',
        `mission has spent ${alreadySpent} ${budget.currency}; this action would raise total to ${nextTotal} above cap ${budget.amount}`,
        { spent: alreadySpent, requested: amount, budget: Number(budget.amount), currency: budget.currency }
      );
    }
    return { amount, currency: budget.currency, alreadySpent, nextTotal };
  }

  approvalCheck(missionInput, request, evaluation) {
    if (evaluation.result.decision !== 'require_approval') return evaluation;
    if (!this.approvals) return { ...evaluation, output: null };

    const approvalId = request?.approval_id;
    if (!approvalId) {
      const approval = this.approvals.request({
        mission: missionInput,
        request,
        reason: evaluation.result.reason
      });
      return { ...evaluation, approval, output: null };
    }

    try {
      const approval = this.approvals.consume(approvalId, { mission: missionInput, request });
      const result = {
        decision: 'allow',
        reason: 'authorized by one-time human approval',
        approval_id: approval.approval_id
      };
      return {
        result,
        receipt: createReceipt({ mission: missionInput, request, result }),
        approval
      };
    } catch (error) {
      return executionFailure(missionInput, request, error.code || 'approval_invalid', error.message);
    }
  }

  async readinessCheck(adapter, missionInput, request) {
    if (typeof adapter.validateRequest === 'function') adapter.validateRequest(request);
    if (typeof adapter.prepare !== 'function') return null;
    const dispatch = await adapter.prepare({ mission: missionInput, request });
    if (dispatch?.connection_required) {
      return executionFailure(missionInput, request, 'connection_required', `no active ${request.service} connection for this principal`);
    }
    return null;
  }

  beginMutation(adapter, missionInput, request) {
    if (!adapter.isMutation?.(request)) return null;
    if (!this.executions) {
      return executionFailure(missionInput, request, 'idempotency_store_unavailable', 'mutating action cannot run without an execution guard');
    }
    try {
      return this.executions.begin({ mission: missionInput, request });
    } catch (error) {
      return executionFailure(
        missionInput,
        request,
        error.code || 'idempotency_error',
        error.message,
        error.execution_record ? { execution: error.execution_record } : {}
      );
    }
  }

  /**
   * Execute through the broker while preserving Task Lease narrowing.
   *
   * A lease-level REQUIRE_APPROVAL is returned before adapter readiness or
   * provider execution. It is not converted into a mission-level one-time
   * approval because applying an authority delta back into a live lease is a
   * separate, not-yet-implemented capability.
   */
  async executeTaskLease(lease, request) {
    if (!lease || typeof lease.evaluate !== 'function' || !lease.mission) {
      throw new Error('task lease with mission and evaluate() is required');
    }
    return this.execute(lease.mission, request, { lease });
  }

  async execute(missionInput, request, { lease = null } = {}) {
    if (lease && lease.mission?.mission_id !== missionInput?.mission_id) {
      throw new Error('task lease mission does not match execution mission');
    }

    let evaluation = lease
      ? lease.evaluate(this, request)
      : this.evaluate(missionInput, request);

    if (evaluation.result.decision === 'deny') return { ...evaluation, output: null };

    // A Task Lease is the narrowest authority object. Do not let brokered
    // execution reinterpret a lease-level authority delta as a broader mission
    // approval. This keeps broker behavior aligned with guard.run() and MCP.
    if (lease && evaluation.result.decision !== 'allow') {
      return { ...evaluation, output: null };
    }

    const adapter = this.adapters.resolve(request.service);
    if (!adapter) {
      return executionFailure(missionInput, request, 'adapter_unavailable', `no adapter is registered for ${request.service}`);
    }
    if (typeof adapter.execute !== 'function') {
      return executionFailure(missionInput, request, 'execution_unavailable', `${adapter.kind || 'selected'} adapter cannot execute actions yet`);
    }

    const budgetCheck = this.cumulativeBudgetCheck(missionInput, request);
    if (budgetCheck?.result?.decision === 'deny') return budgetCheck;

    try {
      const readinessFailure = await this.readinessCheck(adapter, missionInput, request);
      if (readinessFailure) return readinessFailure;
    } catch (error) {
      if (error?.code === 'connection_required') {
        return executionFailure(missionInput, request, 'connection_required', error.message);
      }
      return executionFailure(missionInput, request, error.code || 'invalid_provider_request', error.message);
    }

    evaluation = this.approvalCheck(missionInput, request, evaluation);
    if (evaluation.result.decision !== 'allow') return { ...evaluation, output: null };

    const executionRecord = this.beginMutation(adapter, missionInput, request);
    if (executionRecord?.result?.decision === 'deny') return executionRecord;

    try {
      const output = await adapter.execute({ mission: missionInput, request });
      const evidence = createExecutionEvidence({ receipt: evaluation.receipt, output });
      let usage = null;
      if (budgetCheck && !budgetCheck.result) {
        const spent = this.usage.record(missionInput.mission_id, budgetCheck.currency, budgetCheck.amount);
        usage = {
          currency: budgetCheck.currency,
          spent,
          remaining: Math.max(0, Number(missionInput.constraints.budget.amount) - spent)
        };
      }
      if (executionRecord && this.executions) {
        this.executions.complete({ mission: missionInput, request, receipt_id: evaluation.receipt?.receipt_id || null });
      }
      return { ...evaluation, output, evidence, usage, execution: executionRecord || null };
    } catch (error) {
      if (executionRecord && this.executions) {
        this.executions.uncertain({ mission: missionInput, request, error_code: error.code || 'provider_error' });
      }
      if (error?.code === 'connection_required') {
        return executionFailure(missionInput, request, 'connection_required', error.message);
      }
      throw error;
    }
  }
}
