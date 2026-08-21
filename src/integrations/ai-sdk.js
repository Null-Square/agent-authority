function requireFunction(value, message) {
  if (typeof value !== 'function') throw new Error(message);
  return value;
}

/**
 * Wrap a Vercel AI SDK-style tool set with an Agent Authority guard without
 * adding the `ai` package as a runtime dependency.
 *
 * Each entry keeps the original tool definition (schema, description, etc.)
 * and replaces only `execute`. The authority request is derived from the
 * already-validated tool input immediately before the original execute
 * function is invoked.
 *
 * `onAuthorizedResult` runs after the underlying tool has executed and receives
 * the Agent Authority receipt. It is useful for deriving facts from read-like
 * tools. Do not use a throwing post-execute hook as rollback for irreversible
 * effects: by then the provider action has already happened.
 */
export function withAiSdkAuthority({ guard, tools } = {}) {
  if (!guard || typeof guard.run !== 'function') {
    throw new Error('guard with run(request, effect) is required');
  }
  if (!tools || typeof tools !== 'object' || Array.isArray(tools)) {
    throw new Error('tools configuration object is required');
  }

  return Object.fromEntries(Object.entries(tools).map(([toolName, config]) => {
    if (!config || typeof config !== 'object') {
      throw new Error(`tool config for ${toolName} is required`);
    }

    const tool = config.tool;
    if (!tool || typeof tool !== 'object') {
      throw new Error(`tool definition for ${toolName} is required`);
    }

    const execute = requireFunction(tool.execute, `tool ${toolName} must define execute`);
    const request = requireFunction(config.request, `tool ${toolName} must define request(input, options)`);
    const onAuthorizedResult = config.onAuthorizedResult === undefined
      ? null
      : requireFunction(config.onAuthorizedResult, `tool ${toolName} onAuthorizedResult must be a function`);

    return [toolName, {
      ...tool,
      execute: async (...args) => {
        const [input, options] = args;
        const authorityRequest = await request(input, options);
        const guarded = await guard.run(authorityRequest, () => execute(...args));

        if (onAuthorizedResult) {
          await onAuthorizedResult({
            toolName,
            input,
            options,
            output: guarded.output,
            result: guarded.result,
            receipt: guarded.receipt
          });
        }

        return guarded.output;
      }
    }];
  }));
}
