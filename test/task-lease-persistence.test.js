import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AuthorityRuntime } from '../src/index.js';
import { createTaskLeaseGuard } from '../src/guard.js';
import { createTaskLease, restoreTaskLease } from '../src/task-lease.js';
import { JsonFileTaskLeaseStore, defaultConfig } from '../src/storage.js';

function mission(overrides = {}) {
  return {
    version: '0.1',
    mission_id: 'mission:durable-lease',
    principal: { id: 'user:durable' },
    agent: { id: 'agent:durable' },
    objective: 'Discover one item and access only that item',
    resources: [{
      service: 'demo',
      allow: ['item.discover', 'item.access'],
      deny: [],
      constraints: {}
    }],
    constraints: {},
    ...overrides
  };
}

function itemExtractor({ receipt, output } = {}) {
  if (receipt?.service !== 'demo' || receipt?.action !== 'item.discover') {
    const error = new Error('wrong operation');
    error.code = 'trusted_extractor_operation_mismatch';
    throw error;
  }
  if (typeof output?.item !== 'string' || output.item.length === 0) {
    const error = new Error('invalid item');
    error.code = 'trusted_extractor_output_invalid';
    throw error;
  }
  return { extractor_id: 'demo.item.v1', selector: 'output.item' };
}

async function leaseWithDerivedFact({ expires_at = null } = {}) {
  const m = mission();
  const lease = createTaskLease({
    mission: m,
    request: 'Discover and access alpha',
    expires_at,
    roots: [{ fact_id: 'fact:catalog', kind: 'demo.catalog', value: 'catalog:main' }],
    bindings: [{
      service: 'demo',
      action: 'item.access',
      context_field: 'item',
      fact_id: 'fact:item'
    }]
  });
  const guard = createTaskLeaseGuard({ lease, runtime: new AuthorityRuntime() });
  const read = await guard.run(
    { service: 'demo', action: 'item.discover', context: { catalog: 'catalog:main' } },
    async () => ({ item: 'alpha', provider_revision: 7 })
  );
  const fact = lease.deriveFromEvidence({
    fact_id: 'fact:item',
    kind: 'demo.item',
    from: ['fact:catalog'],
    receipt: read.receipt,
    evidence: read.evidence,
    output: read.output,
    extractor: itemExtractor
  });
  return { mission: m, lease, fact };
}

function withStore(fn) {
  const home = mkdtempSync(join(tmpdir(), 'agent-authority-lease-'));
  const store = new JsonFileTaskLeaseStore({
    dir: join(home, 'state', 'task-leases'),
    keyPath: join(home, 'vault', 'master.key')
  });
  return Promise.resolve()
    .then(() => fn({ home, store }))
    .finally(() => rmSync(home, { recursive: true, force: true }));
}

test('authenticated Task Lease recovery preserves strict derived authority and lineage', async () => {
  await withStore(async ({ store }) => {
    const { mission: m, lease, fact } = await leaseWithDerivedFact();
    const originalHash = lease.hash();
    const saved = store.save(lease);
    assert.equal(saved.lease_hash, originalHash);

    const recovered = store.load({ mission: m, lease_id: lease.lease_id });
    assert.ok(recovered);
    assert.notEqual(recovered, lease);
    assert.equal(recovered.hash(), originalHash);
    assert.deepEqual(recovered.snapshot(), lease.snapshot());

    const recoveredFact = recovered.fact('fact:item');
    assert.equal(recoveredFact.value, 'alpha');
    assert.equal(recoveredFact.provenance.derivation_mode, 'execution-evidence-v1');
    assert.equal(recoveredFact.provenance.receipt_hash, fact.provenance.receipt_hash);
    assert.equal(recoveredFact.provenance.source_output_hash, fact.provenance.source_output_hash);
    assert.equal(recoveredFact.provenance.execution_evidence_hash, fact.provenance.execution_evidence_hash);

    const runtime = new AuthorityRuntime();
    const allowed = recovered.evaluate(runtime, {
      service: 'demo', action: 'item.access', context: { item: 'alpha' }
    });
    assert.equal(allowed.result.decision, 'allow');
    assert.equal(allowed.receipt.task_lease_id, lease.lease_id);

    const blocked = recovered.evaluate(runtime, {
      service: 'demo', action: 'item.access', context: { item: 'beta' }
    });
    assert.equal(blocked.result.decision, 'require_approval');
    assert.equal(blocked.result.code, 'authority_delta_required');
  });
});

test('completed Task Lease remains completed after process-style recovery', async () => {
  await withStore(async ({ store }) => {
    const { mission: m, lease } = await leaseWithDerivedFact();
    lease.complete('durable task finished');
    store.save(lease);

    const recovered = store.load({ mission: m, lease_id: lease.lease_id });
    assert.equal(recovered.status, 'completed');
    assert.equal(recovered.completion_reason, 'durable task finished');
    assert.ok(recovered.completed_at);

    const denied = recovered.evaluate(new AuthorityRuntime(), {
      service: 'demo', action: 'item.access', context: { item: 'alpha' }
    });
    assert.equal(denied.result.decision, 'deny');
    assert.equal(denied.result.code, 'task_lease_completed');
  });
});

test('Task Lease expiry survives recovery and cannot be reset by restart', async () => {
  await withStore(async ({ store }) => {
    const expiresAt = '2030-01-01T00:00:00.000Z';
    const { mission: m, lease } = await leaseWithDerivedFact({ expires_at: expiresAt });
    store.save(lease);
    const recovered = store.load({ mission: m, lease_id: lease.lease_id });
    assert.equal(recovered.expires_at, expiresAt);

    const denied = recovered.evaluate(
      new AuthorityRuntime(),
      { service: 'demo', action: 'item.access', context: { item: 'alpha' } },
      new Date('2030-01-01T00:00:01.000Z')
    );
    assert.equal(denied.result.decision, 'deny');
    assert.equal(denied.result.code, 'task_lease_expired');
  });
});

test('disk snapshot tampering is rejected before recovered state becomes authority', async () => {
  await withStore(async ({ store }) => {
    const { mission: m, lease } = await leaseWithDerivedFact();
    store.save(lease);

    const path = store.path(lease.lease_id);
    const envelope = JSON.parse(readFileSync(path, 'utf8'));
    const fact = envelope.snapshot.facts.find((entry) => entry.fact_id === 'fact:item');
    fact.value = 'attacker-controlled';
    writeFileSync(path, `${JSON.stringify(envelope, null, 2)}\n`);

    assert.throws(
      () => store.load({ mission: m, lease_id: lease.lease_id }),
      (error) => error.code === 'task_lease_state_authentication_failed'
    );
  });
});

test('recovery rejects a different mission even when mission_id is reused', async () => {
  await withStore(async ({ store }) => {
    const { lease } = await leaseWithDerivedFact();
    store.save(lease);

    const expandedMission = mission({
      objective: 'Broadened objective after restart',
      resources: [{
        service: 'demo',
        allow: ['item.discover', 'item.access', 'item.delete'],
        deny: [],
        constraints: {}
      }]
    });

    assert.throws(
      () => store.load({ mission: expandedMission, lease_id: lease.lease_id }),
      (error) => error.code === 'task_lease_snapshot_mission_mismatch'
    );
  });
});

test('snapshot restoration rejects authority facts with missing lineage or cycles', async () => {
  const { mission: m, lease } = await leaseWithDerivedFact();

  const missingParent = lease.snapshot();
  const derived = missingParent.facts.find((fact) => fact.fact_id === 'fact:item');
  derived.provenance.from = ['fact:does-not-exist'];
  assert.throws(
    () => restoreTaskLease({ mission: m, snapshot: missingParent }),
    (error) => error.code === 'task_lease_snapshot_invalid'
  );

  const cyclic = lease.snapshot();
  const root = cyclic.facts.find((fact) => fact.fact_id === 'fact:catalog');
  root.provenance = {
    type: 'derived',
    derivation_mode: 'host-trusted',
    from: ['fact:item'],
    task_lease_id: lease.lease_id,
    receipt_id: 'receipt:cycle',
    receipt_hash: 'cycle-receipt-hash',
    source_service: 'demo',
    source_action: 'item.discover',
    source_request_hash: 'cycle-request-hash',
    selector: 'output.item'
  };
  assert.throws(
    () => restoreTaskLease({ mission: m, snapshot: cyclic }),
    (error) => error.code === 'task_lease_snapshot_invalid'
  );
});

test('default config reserves authenticated Task Lease state directory', () => {
  const config = defaultConfig('/tmp/agent-authority-config-test');
  assert.equal(config.paths.task_leases, '/tmp/agent-authority-config-test/state/task-leases');
});

test('transaction atomically persists authority fact and binding updates', async () => {
  await withStore(async ({ store }) => {
    const { mission: m, lease } = await leaseWithDerivedFact();
    const initial = store.save(lease);

    const updated = store.transact({
      mission: m,
      lease_id: lease.lease_id,
      expected_lease_hash: initial.lease_hash,
      mutate: (current) => {
        current.addRoot({ fact_id: 'fact:region', kind: 'demo.region', value: 'us-east' });
        current.bind({
          service: 'demo',
          action: 'item.access',
          context_field: 'region',
          fact_id: 'fact:region'
        });
        return { updated: ['fact:region', 'binding:region'] };
      }
    });

    assert.notEqual(updated.lease_hash, initial.lease_hash);
    assert.equal(updated.previous_lease_hash, initial.lease_hash);
    assert.deepEqual(updated.value, { updated: ['fact:region', 'binding:region'] });

    const recovered = store.load({ mission: m, lease_id: lease.lease_id });
    assert.equal(recovered.hash(), updated.lease_hash);
    assert.equal(recovered.fact('fact:region').value, 'us-east');

    const runtime = new AuthorityRuntime();
    const allowed = recovered.evaluate(runtime, {
      service: 'demo', action: 'item.access', context: { item: 'alpha', region: 'us-east' }
    });
    assert.equal(allowed.result.decision, 'allow');

    const wrongRegion = recovered.evaluate(runtime, {
      service: 'demo', action: 'item.access', context: { item: 'alpha', region: 'eu-west' }
    });
    assert.equal(wrongRegion.result.decision, 'require_approval');
    assert.equal(wrongRegion.result.code, 'authority_delta_required');
  });
});

test('stale recovered worker cannot overwrite a newer durable Task Lease', async () => {
  await withStore(async ({ store }) => {
    const { mission: m, lease } = await leaseWithDerivedFact();
    const initial = store.save(lease);
    const workerA = store.load({ mission: m, lease_id: lease.lease_id });
    const workerB = store.load({ mission: m, lease_id: lease.lease_id });
    assert.equal(workerA.hash(), initial.lease_hash);
    assert.equal(workerB.hash(), initial.lease_hash);

    const committed = store.transact({
      mission: m,
      lease_id: lease.lease_id,
      expected_lease_hash: workerA.hash(),
      mutate: (current) => current.bind({
        service: 'demo', action: 'item.access', context_field: 'catalog', fact_id: 'fact:catalog'
      })
    });
    assert.notEqual(committed.lease_hash, initial.lease_hash);

    assert.throws(
      () => store.transact({
        mission: m,
        lease_id: lease.lease_id,
        expected_lease_hash: workerB.hash(),
        mutate: (current) => current.complete('stale worker must not win')
      }),
      (error) => error.code === 'task_lease_state_conflict'
        && error.expected_lease_hash === initial.lease_hash
        && error.current_lease_hash === committed.lease_hash
    );

    const recovered = store.load({ mission: m, lease_id: lease.lease_id });
    assert.equal(recovered.status, 'active');
    assert.equal(recovered.hash(), committed.lease_hash);
  });
});

test('changed raw save cannot bypass durable compare-and-swap protection', async () => {
  await withStore(async ({ store }) => {
    const { mission: m, lease } = await leaseWithDerivedFact();
    const initial = store.save(lease);
    const stale = store.load({ mission: m, lease_id: lease.lease_id });

    const committed = store.transact({
      mission: m,
      lease_id: lease.lease_id,
      expected_lease_hash: initial.lease_hash,
      mutate: (current) => current.complete('authoritative completion')
    });

    stale.bind({
      service: 'demo', action: 'item.access', context_field: 'catalog', fact_id: 'fact:catalog'
    });
    assert.throws(
      () => store.save(stale),
      (error) => error.code === 'task_lease_state_conflict'
        && error.current_lease_hash === committed.lease_hash
    );

    const recovered = store.load({ mission: m, lease_id: lease.lease_id });
    assert.equal(recovered.status, 'completed');
    assert.equal(recovered.completion_reason, 'authoritative completion');
  });
});

test('transaction lock fails closed instead of racing another local worker', async () => {
  await withStore(async ({ store }) => {
    const { mission: m, lease } = await leaseWithDerivedFact();
    store.save(lease);
    mkdirSync(store.lockPath(lease.lease_id), { mode: 0o700 });
    try {
      assert.throws(
        () => store.transact({
          mission: m,
          lease_id: lease.lease_id,
          mutate: (current) => current.complete('must not run while locked')
        }),
        (error) => error.code === 'task_lease_state_locked'
      );
    } finally {
      rmSync(store.lockPath(lease.lease_id), { recursive: true, force: true });
    }

    const recovered = store.load({ mission: m, lease_id: lease.lease_id });
    assert.equal(recovered.status, 'active');
  });
});

test('failed or asynchronous durable mutation leaves authenticated state unchanged', async () => {
  await withStore(async ({ store }) => {
    const { mission: m, lease } = await leaseWithDerivedFact();
    const initial = store.save(lease);

    assert.throws(
      () => store.transact({
        mission: m,
        lease_id: lease.lease_id,
        expected_lease_hash: initial.lease_hash,
        mutate: (current) => {
          current.complete('rolled back');
          throw new Error('mutation failed');
        }
      }),
      /mutation failed/
    );
    assert.equal(store.load({ mission: m, lease_id: lease.lease_id }).hash(), initial.lease_hash);

    assert.throws(
      () => store.transact({
        mission: m,
        lease_id: lease.lease_id,
        expected_lease_hash: initial.lease_hash,
        mutate: (current) => {
          current.complete('async transaction must not persist');
          return { then() {} };
        }
      }),
      (error) => error.code === 'task_lease_transaction_async_unsupported'
    );

    const recovered = store.load({ mission: m, lease_id: lease.lease_id });
    assert.equal(recovered.hash(), initial.lease_hash);
    assert.equal(recovered.status, 'active');
  });
});

test('unchanged save is idempotent while expected hash permits explicit replacement', async () => {
  await withStore(async ({ store }) => {
    const { mission: m, lease } = await leaseWithDerivedFact();
    const initial = store.save(lease);
    const recovered = store.load({ mission: m, lease_id: lease.lease_id });

    assert.deepEqual(store.save(recovered), initial);

    recovered.complete('explicit compare-and-swap save');
    const saved = store.save(recovered, { expected_lease_hash: initial.lease_hash });
    assert.notEqual(saved.lease_hash, initial.lease_hash);
    assert.equal(store.load({ mission: m, lease_id: lease.lease_id }).status, 'completed');
  });
});

test('transaction cannot expand caller mission through a recovered lease alias', async () => {
  await withStore(async ({ store }) => {
    const { mission: m, lease } = await leaseWithDerivedFact();
    const originalMission = structuredClone(m);
    const initial = store.save(lease);

    assert.throws(
      () => store.transact({
        mission: m,
        lease_id: lease.lease_id,
        expected_lease_hash: initial.lease_hash,
        mutate: (current) => {
          current.mission.resources[0].allow.push('item.delete');
        }
      }),
      (error) => error.code === 'task_lease_snapshot_mission_mismatch'
    );

    assert.deepEqual(m, originalMission);
    const recovered = store.load({ mission: m, lease_id: lease.lease_id });
    assert.equal(recovered.hash(), initial.lease_hash);
    assert.deepEqual(recovered.mission, originalMission);
  });
});
