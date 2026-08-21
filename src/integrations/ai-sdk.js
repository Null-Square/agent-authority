export class UnmappedAiSdkToolError extends Error {
  constructor(toolName) {
    super(`AI SDK tool ${toolName} has execute() but no Agent Authority request mapping`);
    this.name = 'UnmappedAiSdkToolError';
    this.code = 'ai_sdk_tool_unmapped';
    this.tool_name = toolName;
  }
}

function assertGuard(guard) {
  if (!guard || typeof guard.run !== 'function') {
    throw new Error('Agent Authority guard with run(request, effect) is required');
  }
}

function assertRequest(toolName, request) {
  if (!request || typeof request !== 'object') {
    throw new Error(`request mapper for AI SDK tool ${toolName} must return an authority request`);
  }
  if (!request.service || !request.action) {
    throw new Error(`authority request for AI SDK tool ${toolName} requires service and action`);
  }
  return request;
}

/**
 * Wrap Vercel AI SDK Tool objects without changing their schemas, descriptions,
 * approval metadata, or the surrounding ToolLoopAgent architecture.
 *
 * Every executable tool must have a request mapper. Missing mappings fail
 * closed at execution time rather than silently bypassing Agent Authority.
 */
export function protectAiSdkTools({ tools, guard, requests = {} } = {}) {
  assertGuard(guard);
  if (!tools || typeof tools !== 'object' || Array.isArray(tools)) {
    throw new Error('AI SDK tools object is required');
  }
  if (!requests || typeof requests !== 'object' || Array.isArray(requests)) {
    throw new Error('AI SDK request mappings must be an object');
  }

  return Object.fromEntries(Object.entries(tools).map(([toolName, tool]) => {
    if (!tool || typeof tool !== 'object') return [toolName, tool];
    if (typeof tool.execute !== 'function') return [toolName, tool];

    const originalExecute = tool.execute;
    const mapper = requests[toolName];

    return [toolName, {
      ...tool,
      execute: async (input, options) => {
        if (typeof mapper !== 'function') throw new UnmappedAiSdkToolError(toolName);
        const request = assertRequest(toolName, await mapper(input, options));
        const { output } = await guard.run(request, () => originalExecute.call(tool, input, options));
        return output;
      }
    }];
  }));
}
