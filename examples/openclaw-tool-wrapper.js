import { AgentAuthorityClient } from '../src/sdk.js';

// Thin integration pattern for an OpenClaw/plugin-style tool wrapper.
// The wrapper owns no provider credentials. It forwards normalized authority
// requests to the Agent Authority sidecar and returns sanitized output.

const authority = new AgentAuthorityClient({
  baseUrl: process.env.AGENT_AUTHORITY_URL || 'http://127.0.0.1:8787'
});

export function createAuthorityTool({ mission }) {
  return async function executeAuthorityTool({ service, action, context = {}, params = {} }) {
    const result = await authority.execute(mission, {
      service,
      action,
      context,
      params
    });

    if (result.result?.decision === 'deny') {
      const error = new Error(result.result.reason || 'Agent Authority denied the action');
      error.code = result.result.code || 'authority_denied';
      throw error;
    }

    if (result.result?.decision === 'require_approval') {
      return {
        status: 'require_approval',
        receipt: result.receipt,
        reason: result.result.reason
      };
    }

    return {
      status: 'ok',
      receipt: result.receipt,
      output: result.output
    };
  };
}

// Example OpenClaw tool mapping:
//
// await tool({
//   service: 'github',
//   action: 'repo.contents.read',
//   context: { repository: 'Null-Square/agent-authority' },
//   params: { path: 'src/index.js' }
// });
