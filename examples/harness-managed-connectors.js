import { randomBytes } from 'node:crypto';
import { AuthorityRuntime } from '../src/index.js';
import { issueHarnessActionGrant, createHarnessConnectorGate } from '../src/harness-bridge.js';

const signingKey = randomBytes(32);
const authority = new AuthorityRuntime();
const gate = createHarnessConnectorGate({ key: signingKey });

const mission = {
  version: '0.1',
  mission_id: 'mission:hosted-harness-demo',
  principal: { id: 'user:example' },
  agent: { id: 'agent:hosted-harness:session-1' },
  objective: 'Read an approved GitHub repository through a harness-managed connector',
  resources: [
    {
      service: 'github',
      allow: ['repo.read'],
      deny: ['repo.write', 'repo.delete'],
      constraints: { repository: ['Null-Square/agent-authority'] }
    }
  ]
};

const request = {
  service: 'github',
  action: 'repo.read',
  context: { repository: 'Null-Square/agent-authority' }
};

// 1. Agent Authority evaluates the human-approved mission.
const evaluation = authority.evaluate(mission, request);
if (evaluation.result.decision !== 'allow') {
  console.error(evaluation.result);
  process.exit(1);
}

// 2. Trusted authority code issues a short-lived grant for the exact request.
const { token: grant } = issueHarnessActionGrant({
  key: signingKey,
  mission,
  request,
  ttl_seconds: 30
});

// 3. This represents trusted harness connector middleware. The provider token
// stays inside the hosted platform; Agent Authority never needs to see it.
async function harnessGitHubConnector({ grant, mission, request }) {
  gate.verify({ grant, mission, request });

  // Replace this stub with the harness-owned GitHub connector. For example,
  // a hosted platform may already have the user's GitHub OAuth connection.
  return {
    provider: 'github',
    repository: request.context.repository,
    executed_by: 'harness-managed-connector',
    provider_credential_exposed_to_agent_authority: false
  };
}

console.log(await harnessGitHubConnector({ grant, mission, request }));

// Changing the resource after authorization must fail verification.
try {
  await harnessGitHubConnector({
    grant,
    mission,
    request: { ...request, context: { repository: 'Null-Square/other-repository' } }
  });
} catch (error) {
  console.log(`blocked substitution: ${error.code}`);
}
