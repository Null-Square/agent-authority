import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { AuthorityRuntime } from '../src/index.js';
import {
  AuthorityApprovalRequiredError,
  AuthorityDeniedError,
  createTaskLeaseGuard
} from '../src/guard.js';
import { createTaskLease } from '../src/task-lease.js';
import { JsonFileTaskLeaseStore } from '../src/storage.js';
import {
  createDurableTaskLeaseSession,
  openDurableTaskLeaseSession
} from '../src/durable-task-lease.js';

function mission() {
  return {
    version: '0.1',
    mission_id: 'mission:durable-session',
    principal: { id: 'user:durable-session' },
    agent: { id: 'agent:durable-session' },
    objective: 'Discover and access exactly the task item',
    resources: [{
      service: 'demo',
      allow: ['item.discover', 'item.access'],
      deny: [],
      constraints: {}
    }],
    constraints: {}
  };
}

function initialLease() {
  const m = mission();
  return {
    mission: m,
    lease: createTaskLease({
      mission: m,
      request: 'Discover and access alpha',
      roots: [{ fact_id: 'fact:catalog', kind: 'demo.catalog', value: 'catalog:main' }],
      bindings: [{
        service: 'demo',
        action: 'item.access',
        context_field: 'item',
        fact_id: 'fact:item'
      }]
    })
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
  return { extractor_id: 'demo.session.item.v1', selector: 'output.item' };
}

function withStore(fn) {
  const home = mkdtempSync(join(tmpdir(), 'agent-authority-session-'));
  const store = new JsonFileTaskLeaseStore({
    dir: join(home, 'state', 'task-leases'),
    keyPath: join(home, 'vault', 'master.key')
  });
  return Promise.resolve()
    .then(() => fn({ home, store }))
    .finally(() => rmSync(home, { recursive: true, force: true }));
}

async function establishItemAuthority({ session, item = 'alpha' }) {
  const guard = createTaskLeaseGuard({ lease: session, runtime: new AuthorityRuntime() });
  const read = await guard.run(
    { service: 'demo', action: 'item.discover', context: { catalog: 'catalog:main' } },
    async () => ({ item, provider_revision: 11 })
  );
  const fact = session.deriveFromEvidence({
    fact_id: 'fact:item',
    kind: 'demo.item',
    from: ['fact:catalog'],
    receipt: read.receipt,
    evidence: read.evidence,
    output: read.output,
    extractor: itemExtractor
  });
  return { read, fact };
}

test('durable session derives strict authority and reopens with the same guard behavior', async () => {
  await withStore(async ({ store }) => {
    const { mission: m, lease } = initialLease();
    const session = createDurableTaskLeaseSession({ store, lease });
    const initialHash = session.hash();

    const { fact } = await establishItemAuthority({ session });
    assert.equal(fact.value, 'alpha');
    assert.equal(fact.provenance.derivation_mode, 'execution-evidence-v1');
    assert.notEqual(session.hash(), initialHash);

    const reopened = openDurableTaskLeaseSession({
      store,
      mission: m,
      lease_id: lease.lease_id
    });
    assert.equal(reopened.hash(), session.hash());
    assert.equal(reopened.fact('fact:item').value, 'alpha');

    const effects = [];
    const guard = createTaskLeaseGuard({ lease: reopened, runtime: new AuthorityRuntime() });
    const allowed = await guard.run(
      { service: 'demo', action: 'item.access', context: { item: 'alpha' } },
      async () => { effects.push('alpha'); return { ok: true }; }
    );
    assert.deepEqual(allowed.output, { ok: true });
    assert.deepEqual(effects, ['alpha']);

    await assert.rejects(
      () => guard.run(
        { service: 'demo', action: 'item.access', context: { item: 'beta' } },
        async () => { effects.push('beta'); return { ok: true }; }
      ),
      (error) => error instanceof AuthorityApprovalRequiredError
        && error.code === 'authority_delta_required'
    );
    assert.deepEqual(effects, ['alpha']);
  });
});

test('stale durable session observes another worker completion before next guarded effect', async () => {
  await withStore(async ({ store }) => {
    const { mission: m, lease } = initialLease();
    const creator = createDurableTaskLeaseSession({ store, lease });
    await establishItemAuthority({ session: creator });

    const workerA = openDurableTaskLeaseSession({ store, mission: m, lease_id: lease.lease_id });
    const workerB = openDurableTaskLeaseSession({ store, mission: m, lease_id: lease.lease_id });
    const staleHash = workerB.hash();

    workerA.complete('worker A finished the task');
    assert.notEqual(workerA.hash(), staleHash);
    assert.equal(workerB.status, 'active');

    let effects = 0;
    const guardB = createTaskLeaseGuard({ lease: workerB, runtime: new AuthorityRuntime() });
    await assert.rejects(
      () => guardB.run(
        { service: 'demo', action: 'item.access', context: { item: 'alpha' } },
        async () => { effects += 1; return { ok: true }; }
      ),
      (error) => error instanceof AuthorityDeniedError
        && error.code === 'task_lease_completed'
    );

    assert.equal(effects, 0);
    assert.equal(workerB.status, 'completed');
    assert.equal(workerB.completion_reason, 'worker A finished the task');
    assert.equal(workerB.hash(), workerA.hash());
  });
});

test('stale semantic mutation is not silently replayed against a newer durable lease', async () => {
  await withStore(async ({ store }) => {
    const { mission: m, lease } = initialLease();
    createDurableTaskLeaseSession({ store, lease });

    const workerA = openDurableTaskLeaseSession({ store, mission: m, lease_id: lease.lease_id });
    const workerB = openDurableTaskLeaseSession({ store, mission: m, lease_id: lease.lease_id });
    const sharedHash = workerA.hash();
    assert.equal(workerB.hash(), sharedHash);

    workerA.addRoot({ fact_id: 'fact:region', kind: 'demo.region', value: 'us-east' });
    assert.notEqual(workerA.hash(), sharedHash);

    assert.throws(
      () => workerB.addRoot({ fact_id: 'fact:environment', kind: 'demo.environment', value: 'prod' }),
      (error) => error.code === 'task_lease_state_conflict'
        && error.expected_lease_hash === sharedHash
        && error.current_lease_hash === workerA.hash()
    );
    assert.equal(workerB.fact('fact:environment'), null);

    workerB.refresh();
    assert.equal(workerB.hash(), workerA.hash());
    workerB.addRoot({ fact_id: 'fact:environment', kind: 'demo.environment', value: 'prod' });

    const reopened = openDurableTaskLeaseSession({ store, mission: m, lease_id: lease.lease_id });
    assert.equal(reopened.fact('fact:region').value, 'us-east');
    assert.equal(reopened.fact('fact:environment').value, 'prod');
  });
});

test('evidence captured on a stale session conflicts if durable authority changes before derivation', async () => {
  await withStore(async ({ store }) => {
    const { mission: m, lease } = initialLease();
    createDurableTaskLeaseSession({ store, lease });

    const workerA = openDurableTaskLeaseSession({ store, mission: m, lease_id: lease.lease_id });
    const workerB = openDurableTaskLeaseSession({ store, mission: m, lease_id: lease.lease_id });
    const guardB = createTaskLeaseGuard({ lease: workerB, runtime: new AuthorityRuntime() });

    const read = await guardB.run(
      { service: 'demo', action: 'item.discover', context: { catalog: 'catalog:main' } },
      async () => ({ item: 'alpha', provider_revision: 12 })
    );
    const readHash = workerB.hash();

    workerA.addRoot({ fact_id: 'fact:region', kind: 'demo.region', value: 'us-east' });
    assert.notEqual(workerA.hash(), readHash);

    assert.throws(
      () => workerB.deriveFromEvidence({
        fact_id: 'fact:item',
        kind: 'demo.item',
        from: ['fact:catalog'],
        receipt: read.receipt,
        evidence: read.evidence,
        output: read.output,
        extractor: itemExtractor
      }),
      (error) => error.code === 'task_lease_state_conflict'
        && error.expected_lease_hash === readHash
        && error.current_lease_hash === workerA.hash()
    );

    const reopened = openDurableTaskLeaseSession({ store, mission: m, lease_id: lease.lease_id });
    assert.equal(reopened.fact('fact:item'), null);
    assert.equal(reopened.fact('fact:region').value, 'us-east');
  });
});

test('durable session does not expose mutable mission or snapshot aliases', async () => {
  await withStore(async ({ store }) => {
    const { mission: m, lease } = initialLease();
    const session = createDurableTaskLeaseSession({ store, lease });
    const originalHash = session.hash();

    const missionView = session.mission;
    missionView.resources[0].allow.push('item.delete');
    const snapshotView = session.snapshot();
    snapshotView.facts[0].value = 'attacker-controlled';
    snapshotView.bindings.push({
      service: 'demo', action: 'item.access', context_field: 'region', fact_id: 'fact:missing'
    });

    assert.equal(session.hash(), originalHash);
    assert.deepEqual(session.mission, m);
    assert.equal(session.fact('fact:catalog').value, 'catalog:main');

    session.refresh();
    assert.equal(session.hash(), originalHash);
    assert.deepEqual(session.mission, m);
    assert.equal(session.fact('fact:catalog').value, 'catalog:main');
  });
});
