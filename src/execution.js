import { AuthorityRuntime, createReceipt } from './index.js';

function executionFailure(mission, request, code, reason) {
  const result = { decision: 'deny', code, reason };
  return { result, receipt: createReceipt({ mission, request, result }), output: null };
}

/**
 * AuthorityRuntime variant that keeps credentials and authenticated execution
 * behind the authority boundary. The calling agent receives only the sanitized
 * provider output, never the long-lived credential.
 */
export class ExecutingAuthorityRuntime extends AuthorityRuntime {
  async execute(missionInput, request) {
    const evaluation = this.evaluate(missionInput, request);
    if (evaluation.result.decision !== 'allow') {
      return { ...evaluation, output: null };
    }

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
      return { ...evaluation, output };
    } catch (error) {
      if (error?.code === 'connection_required') {
        return executionFailure(missionInput, request, 'connection_required', error.message);
      }
      throw error;
    }
  }
}
