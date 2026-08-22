import test from 'node:test';
import assert from 'node:assert/strict';

import { AdapterRegistry } from '../src/index.js';
import { CredentialBroker, brokeredProviderAdapter } from '../src/connections.js';
import { ExecutingAuthorityRuntime } from '../src/execution.js';
import {
  AuthorityApprovalRequiredError,
  AuthorityDeniedError,
  createTaskLeaseGuard
} from '../src/guard.js';
import { MissionMcpGateway } from '../src/mcp-gateway.js';
import { createTaskLease } from '../src/task-lease.js';

function mission() {
  return {
    version: '0.1',
    mission_id: 'mission:transport-invariance',
    principal: { id: 'user:transport-test' },
    agent: { id: 'agent:transport-test' },
    objective: 'Discover one item and access only that item regardless of transport',
    resources: [
      {
        service: 'demo',
        allow: ['item.discover', 'item.access'],
        deny: [],
        constraints: {}
      },
      {
        service: 'mcp:demo',
        allow: ['tool.access_item'],
        deny: [],
        constraints: {}
      }
    ],
    constraints: {}
  };
}

function demoItemExtractor({ receipt, output } = {}) {
  if (receipt?.service !== 'demo' || receipt?.action !== 'item.discover') {
    const error = new Error('demo item extractor only accepts demo:item.discover');
    error.code = 'trusted_extractor_operation_mismatch';
    throw error;
  }
  if (typeof output?.item !== 'string' || output.item.length === 0) {
    const error = new Error('demo discovery output must contain item');
    error.code = 'trusted_extractor_output_invalid';
    throw error;
  }
  return {
    extractor_id: 'demo.item.discover.v1',
    selector: 'output.item'
  };
}

function fakeMcpUpstream() {
  const calls = [];
  return {
    calls,
    async listTools() {
      return {
        tools: [{
          name: 'access_item',
          annotations: { readOnlyHint: true },
          inputSchema: { type: 'object' }
        }]
      };
    },
    async callTool(params) {
      calls.push(structuredClone(params));
      return { content: [{ type: 'text', text: `accessed:${params.arguments.item}` }] };
    }
  };
}

test('one Task Lease preserves the same derived authority across direct, MCP and brokered execution', async () => {
  const m = mission();
  const lease = createTaskLease({
    mission: m,
    request: 'Discover the selected item and access only that item',
    roots: [{ fact_id: 'fact:catalog', kind: 'demo.catalog', value: 'catalog:main' }],
    bindings: [
      {
        service: 'demo',
        action: 'item.access',
        context_field: 'item',
        fact_id: 'fact:selected-item'
      },
      {
        service: 'mcp:demo',
        action: 'tool.access_item',
        context_field: 'item',
        fact_id: 'fact:selected-item'
      }
    ]
  });

  const broker = new CredentialBroker();
  broker.connect({
    principal_id: m.principal.id,
    service: 'demo',
    auth_kind: 'test',
    credential: { access_token: 'transport-secret' }
  });

  let brokerCalls = 0;
  const adapter = brokeredProviderAdapter({
    kind: 'demo-broker',
    services: ['demo'],
    broker,
    async execute({ request, credential }) {
      brokerCalls += 1;
      assert.equal(credential.access_token, 'transport-secret');
      if (request.action === 'item.discover') return { item: 'alpha', source: 'broker' };
      return { item: request.context.item, source: 'broker' };
    }
  });
  adapter.isMutation = () => false;

  const runtime = new ExecutingAuthorityRuntime({
    adapters: new AdapterRegistry().register(adapter)
  });
  const guard = createTaskLeaseGuard({ lease, runtime });
  const upstream = fakeMcpUpstream();
  const mcp = new MissionMcpGateway({
    lease,
    runtime,
    upstream,
    service: 'mcp:demo'
  });

  // Establish the authority fact through brokered execution evidence. The
  // caller never supplies the derived value to TaskLease.
  const discovery = await runtime.executeTaskLease(lease, {
    service: 'demo',
    action: 'item.discover',
    context: { catalog: 'catalog:main' }
  });
  assert.equal(discovery.result.decision, 'allow');
  assert.equal(discovery.output.item, 'alpha');
  assert.match(discovery.evidence.evidence_hash, /^[a-f0-9]{64}$/);
  assert.equal(discovery.receipt.task_lease_id, lease.lease_id);
  assert.equal(brokerCalls, 1);

  const selected = lease.deriveFromEvidence({
    fact_id: 'fact:selected-item',
    kind: 'demo.item',
    from: ['fact:catalog'],
    receipt: discovery.receipt,
    evidence: discovery.evidence,
    output: discovery.output,
    extractor: demoItemExtractor
  });
  assert.equal(selected.value, 'alpha');

  let directCalls = 0;
  const directAllowed = await guard.run(
    { service: 'demo', action: 'item.access', context: { item: 'alpha' } },
    async () => {
      directCalls += 1;
      return { item: 'alpha', source: 'direct' };
    }
  );
  assert.equal(directAllowed.result.decision, 'allow');
  assert.equal(directAllowed.receipt.task_lease_id, lease.lease_id);
  assert.equal(directCalls, 1);

  const mcpAllowed = await mcp.callTool({
    name: 'access_item',
    arguments: { item: 'alpha' }
  });
  assert.equal(mcpAllowed.isError, undefined);
  assert.equal(mcpAllowed._meta['io.nullsquare.agent-authority/decision'], 'allow');
  assert.equal(mcpAllowed._meta['io.nullsquare.agent-authority/task_lease_id'], lease.lease_id);
  assert.equal(upstream.calls.length, 1);

  const brokerAllowed = await runtime.executeTaskLease(lease, {
    service: 'demo',
    action: 'item.access',
    context: { item: 'alpha' }
  });
  assert.equal(brokerAllowed.result.decision, 'allow');
  assert.equal(brokerAllowed.receipt.task_lease_id, lease.lease_id);
  assert.match(brokerAllowed.evidence.evidence_hash, /^[a-f0-9]{64}$/);
  assert.equal(brokerCalls, 2);

  // The same unrelated value must produce the same authority-delta decision on
  // every transport and execute zero callbacks/provider operations.
  await assert.rejects(
    () => guard.run(
      { service: 'demo', action: 'item.access', context: { item: 'beta' } },
      async () => {
        directCalls += 1;
        return { item: 'beta' };
      }
    ),
    (error) => error instanceof AuthorityApprovalRequiredError && error.code === 'authority_delta_required'
  );
  assert.equal(directCalls, 1);

  const mcpBlocked = await mcp.callTool({
    name: 'access_item',
    arguments: { item: 'beta' }
  });
  assert.equal(mcpBlocked.isError, true);
  assert.equal(mcpBlocked._meta['io.nullsquare.agent-authority/decision'], 'require_approval');
  assert.equal(mcpBlocked._meta['io.nullsquare.agent-authority/code'], 'authority_delta_required');
  assert.equal(mcpBlocked._meta['io.nullsquare.agent-authority/task_lease_id'], lease.lease_id);
  assert.equal(upstream.calls.length, 1);

  const brokerBlocked = await runtime.executeTaskLease(lease, {
    service: 'demo',
    action: 'item.access',
    context: { item: 'beta' }
  });
  assert.equal(brokerBlocked.result.decision, 'require_approval');
  assert.equal(brokerBlocked.result.code, 'authority_delta_required');
  assert.equal(brokerBlocked.output, null);
  assert.equal(brokerBlocked.receipt.task_lease_id, lease.lease_id);
  assert.equal(brokerCalls, 2);

  // Completion invalidates the same authority everywhere while the brokered
  // credential remains connected.
  lease.complete('transport invariance proof complete');

  await assert.rejects(
    () => guard.run(
      { service: 'demo', action: 'item.access', context: { item: 'alpha' } },
      async () => {
        directCalls += 1;
        return { item: 'alpha' };
      }
    ),
    (error) => error instanceof AuthorityDeniedError && error.code === 'task_lease_completed'
  );
  assert.equal(directCalls, 1);

  const mcpCompleted = await mcp.callTool({
    name: 'access_item',
    arguments: { item: 'alpha' }
  });
  assert.equal(mcpCompleted.isError, true);
  assert.equal(mcpCompleted._meta['io.nullsquare.agent-authority/code'], 'task_lease_completed');
  assert.equal(upstream.calls.length, 1);

  const brokerCompleted = await runtime.executeTaskLease(lease, {
    service: 'demo',
    action: 'item.access',
    context: { item: 'alpha' }
  });
  assert.equal(brokerCompleted.result.decision, 'deny');
  assert.equal(brokerCompleted.result.code, 'task_lease_completed');
  assert.equal(brokerCompleted.output, null);
  assert.equal(brokerCalls, 2);

  assert.equal(broker.getConnection({ principal_id: m.principal.id, service: 'demo' })?.status, 'active');
});
