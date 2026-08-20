import { AuthorityRuntime, createReceipt } from './index.js';

function executionFailure(mission, request, code, reason, extra = {}) {
  const result = { decision: 'deny', code, reason, ...extra };
  return { result, receipt: createReceipt({ mission, request, result }), output: null };
}

export class InMemoryUsageLedger {
  constructor() {
    this.spending = new Map();
  }

  key(missionId, currency) {
    return `${missionId}\u0000${currency || 'UNSPECIFIED'}`;
  }

  spent(missionId, currency) {
    return this.spending.get(this.key(missionId, currency)) || 0;
  }

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
  }

  cumulativeBudgetCheck(mission, request) {
    const budget = mission.constraints?.budget;
    if (!budget || request?.context?.amount === undefined) return null;

    const currency = request.context.currency || budget.currency;
    if (currency !== budget.currency) {
      return executionFailure(mission, request, 'budget_currency_mismatch', 'request currency does not match mission budget');
    }

    const amount = Number(request.context.amount);
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

  async execute(missionInput, request) {
    const evaluation = this.evaluate(missionInput, request);
    if (evaluation.result.decision !== 'allow') {
      return { ...evaluation, output: null };
    }

    const budgetCheck = this.cumulativeBudgetCheck(missionInput, request);
    if (budgetCheck?.result?.decision === 'deny') return budgetCheck;

    const adapter = this.adapters.resolve(request.service);
    if (!adapter) {
      return executionFailure(
        missionInput,
        request,
        'adapter_unavailable',
        `no adapter is registered for ${request.service}`
      );
    }

    if (typeof adapter.execute !== 'function') {
      return executionFailure(
        missionInput,
        request,
        'execution_unavailable',
        `${adapter.kind || 'selected'} adapter cannot execute actions yet`
      );
    }

    try {
      const output = await adapter.execute({ mission: missionInput, request });
      let usage = null;
      if (budgetCheck && !budgetCheck.result) {
        const spent = this.usage.record(missionInput.mission_id, budgetCheck.currency, budgetCheck.amount);
        usage = {
          currency: budgetCheck.currency,
          spent,
          remaining: Math.max(0, Number(missionInput.constraints.budget.amount) - spent)
        };
      }
      return { ...evaluation, output, usage };
    } catch (error) {
      if (error?.code === 'connection_required') {
        return executionFailure(missionInput, request, 'connection_required', error.message);
      }
      throw error;
    }
  }
}
