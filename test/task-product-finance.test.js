import test from 'node:test';
import assert from 'node:assert/strict';

import { AuthorityApprovalRequiredError, AuthorityDeniedError } from '../src/guard.js';
import { createTask } from '../src/task.js';

function extractor({ service, action, selector, extractorId, validate }) {
  return ({ receipt, output } = {}) => {
    if (receipt?.service !== service || receipt?.action !== action) {
      const error = new Error('wrong operation');
      error.code = 'trusted_extractor_operation_mismatch';
      throw error;
    }
    const key = selector.replace(/^output\./, '');
    const value = output?.[key];
    if (!validate(value)) {
      const error = new Error('invalid output');
      error.code = 'trusted_extractor_output_invalid';
      throw error;
    }
    return { extractor_id: extractorId, selector };
  };
}

const orderIdExtractor = extractor({
  service: 'helpdesk', action: 'ticket.read', selector: 'output.order_id',
  extractorId: 'test.ticket.order.v1', validate: (v) => typeof v === 'string' && v.startsWith('order:')
});
const paymentIdExtractor = extractor({
  service: 'commerce', action: 'order.read', selector: 'output.payment_id',
  extractorId: 'test.order.payment.v1', validate: (v) => typeof v === 'string' && v.startsWith('payment:')
});
const amountExtractor = extractor({
  service: 'payments', action: 'payment.read', selector: 'output.amount_minor',
  extractorId: 'test.payment.amount.v1', validate: (v) => Number.isSafeInteger(v) && v >= 0
});
const currencyExtractor = extractor({
  service: 'payments', action: 'payment.read', selector: 'output.currency',
  extractorId: 'test.payment.currency.v1', validate: (v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v)
});

function financeTask() {
  return createTask({
    principal: 'user:finance-test',
    agent: 'agent:finance-test',
    request: 'Refund no more than the payment established by this support ticket',
    permissions: {
      helpdesk: { allow: ['ticket.read'], constraints: { ticket_id: ['ticket:1'] } },
      commerce: { allow: ['order.read'], constraints: {} },
      payments: {
        allow: ['payment.read', 'refund.create'],
        deny: ['payment.capture', 'refund.delete'],
        constraints: {}
      }
    },
    authority: {
      ticket: { kind: 'helpdesk.ticket', value: 'ticket:1' }
    },
    bindings: [
      { service: 'helpdesk', action: 'ticket.read', field: 'ticket_id', authority: 'ticket' },
      { service: 'commerce', action: 'order.read', field: 'order_id', authority: 'order' },
      { service: 'payments', action: 'payment.read', field: 'payment_id', authority: 'payment' },
      { service: 'payments', action: 'refund.create', field: 'payment_id', authority: 'payment' },
      { service: 'payments', action: 'refund.create', field: 'amount_minor', authority: 'paymentAmount', relation: 'max' },
      { service: 'payments', action: 'refund.create', field: 'currency', authority: 'paymentCurrency' }
    ]
  });
}

async function establishPayment(task, counters) {
  const ticket = await task.run(
    { service: 'helpdesk', action: 'ticket.read', context: { ticket_id: 'ticket:1' } },
    async () => {
      counters.ticket += 1;
      return { ticket_id: 'ticket:1', order_id: 'order:10' };
    }
  );
  const order = task.authorityFrom(ticket, {
    name: 'order', kind: 'commerce.order', from: 'ticket', extractor: orderIdExtractor
  });

  const orderRead = await task.run(
    { service: 'commerce', action: 'order.read', context: { order_id: order.value } },
    async () => {
      counters.order += 1;
      return { order_id: order.value, payment_id: 'payment:20' };
    }
  );
  const payment = task.authorityFrom(orderRead, {
    name: 'payment', kind: 'payments.payment', from: 'order', extractor: paymentIdExtractor
  });

  const paymentRead = await task.run(
    { service: 'payments', action: 'payment.read', context: { payment_id: payment.value } },
    async () => {
      counters.payment += 1;
      return { payment_id: payment.value, amount_minor: 12500, currency: 'USD' };
    }
  );
  const amount = task.authorityFrom(paymentRead, {
    name: 'paymentAmount', kind: 'money.minor-units', from: 'payment', extractor: amountExtractor
  });
  const currency = task.authorityFrom(paymentRead, {
    name: 'paymentCurrency', kind: 'money.currency', from: 'payment', extractor: currencyExtractor
  });
  return { order, payment, amount, currency };
}

test('finance task keeps ticket -> order -> payment -> bounded refund on one evidence-derived lineage', async () => {
  const task = financeTask();
  const counters = { ticket: 0, order: 0, payment: 0, refund: 0 };

  // The order binding exists before the order fact does, so broad commerce
  // permission cannot be used early while the task is still resolving lineage.
  await assert.rejects(
    () => task.run(
      { service: 'commerce', action: 'order.read', context: { order_id: 'order:any' } },
      async () => {
        counters.order += 1;
        return { payment_id: 'payment:wrong' };
      }
    ),
    (error) => error instanceof AuthorityDeniedError && error.code === 'authority_fact_unresolved'
  );
  assert.equal(counters.order, 0);

  const { payment, amount, currency } = await establishPayment(task, counters);
  assert.equal(payment.value, 'payment:20');
  assert.equal(amount.value, 12500);
  assert.equal(currency.value, 'USD');

  const refund = await task.run({
    service: 'payments',
    action: 'refund.create',
    context: { payment_id: payment.value, amount_minor: 5000, currency: currency.value }
  }, async () => {
    counters.refund += 1;
    return { refund_id: 'refund:partial-1' };
  });
  assert.equal(refund.output.refund_id, 'refund:partial-1');
  assert.deepEqual(counters, { ticket: 1, order: 1, payment: 1, refund: 1 });

  for (const [label, context, expectedField] of [
    ['unrelated payment', { payment_id: 'payment:other', amount_minor: 5000, currency: 'USD' }, 'payment_id'],
    ['over refund', { payment_id: 'payment:20', amount_minor: 15000, currency: 'USD' }, 'amount_minor'],
    ['wrong currency', { payment_id: 'payment:20', amount_minor: 5000, currency: 'EUR' }, 'currency']
  ]) {
    let delta;
    await assert.rejects(
      () => task.run(
        { service: 'payments', action: 'refund.create', context },
        async () => {
          counters.refund += 1;
          return { refund_id: `must-not-exist:${label}` };
        }
      ),
      (error) => {
        delta = error;
        return error instanceof AuthorityApprovalRequiredError && error.code === 'authority_delta_required';
      }
    );
    assert.equal(task.explain(delta).field, expectedField);
  }
  assert.equal(counters.refund, 1);

  task.complete('finance task complete');
  await assert.rejects(
    () => task.run(
      {
        service: 'payments', action: 'refund.create',
        context: { payment_id: 'payment:20', amount_minor: 5000, currency: 'USD' }
      },
      async () => {
        counters.refund += 1;
        return { refund_id: 'must-not-run' };
      }
    ),
    (error) => error instanceof AuthorityDeniedError && error.code === 'task_lease_completed'
  );
  assert.equal(counters.refund, 1);
});

test('evidence-derived max authority allows a legitimate partial refund and steps up an over-refund', async () => {
  const task = financeTask();
  const counters = { ticket: 0, order: 0, payment: 0, refund: 0 };
  await establishPayment(task, counters);

  const partial = await task.run(
    {
      service: 'payments', action: 'refund.create',
      context: { payment_id: 'payment:20', amount_minor: 5000, currency: 'USD' }
    },
    async () => {
      counters.refund += 1;
      return { refund_id: 'partial' };
    }
  );
  assert.equal(partial.output.refund_id, 'partial');
  assert.equal(counters.refund, 1);

  await assert.rejects(
    () => task.run(
      {
        service: 'payments', action: 'refund.create',
        context: { payment_id: 'payment:20', amount_minor: 15000, currency: 'USD' }
      },
      async () => {
        counters.refund += 1;
        return { refund_id: 'must-not-run' };
      }
    ),
    (error) => error instanceof AuthorityApprovalRequiredError
      && error.code === 'authority_delta_required'
      && error.result?.authority_delta?.context_field === 'amount_minor'
      && error.result?.authority_delta?.relation === 'max'
  );
  assert.equal(counters.refund, 1);
});
