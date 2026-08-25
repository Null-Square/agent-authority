import { AuthorityApprovalRequiredError, AuthorityDeniedError } from '../src/guard.js';
import { createTask } from '../src/task.js';

const ticketId = 'ticket:4821';

function operationExtractor({ service, action, selector, extractorId, validate }) {
  return ({ receipt, output } = {}) => {
    if (receipt?.service !== service || receipt?.action !== action) {
      const error = new Error(`${extractorId} received the wrong operation`);
      error.code = 'trusted_extractor_operation_mismatch';
      throw error;
    }
    const value = selector.split('.').slice(1).reduce((current, key) => current?.[key], output);
    if (!validate(value)) {
      const error = new Error(`${extractorId} received invalid normalized output`);
      error.code = 'trusted_extractor_output_invalid';
      throw error;
    }
    return { extractor_id: extractorId, selector };
  };
}

const orderIdExtractor = operationExtractor({
  service: 'helpdesk',
  action: 'ticket.read',
  selector: 'output.order_id',
  extractorId: 'demo.helpdesk.ticket.order-id.v1',
  validate: (value) => typeof value === 'string' && value.startsWith('order:')
});

const paymentIdExtractor = operationExtractor({
  service: 'commerce',
  action: 'order.read',
  selector: 'output.payment_id',
  extractorId: 'demo.commerce.order.payment-id.v1',
  validate: (value) => typeof value === 'string' && value.startsWith('payment:')
});

const paymentAmountExtractor = operationExtractor({
  service: 'payments',
  action: 'payment.read',
  selector: 'output.amount_minor',
  extractorId: 'demo.payments.payment.amount-minor.v1',
  validate: (value) => Number.isSafeInteger(value) && value >= 0
});

const paymentCurrencyExtractor = operationExtractor({
  service: 'payments',
  action: 'payment.read',
  selector: 'output.currency',
  extractorId: 'demo.payments.payment.currency.v1',
  validate: (value) => typeof value === 'string' && /^[A-Z]{3}$/.test(value)
});

const task = createTask({
  principal: 'user:finance-demo',
  agent: 'agent:finance-demo',
  request: 'Resolve this support ticket by refunding no more than its affected payment',
  permissions: {
    helpdesk: {
      allow: ['ticket.read'],
      constraints: { ticket_id: [ticketId] }
    },
    commerce: {
      allow: ['order.read'],
      constraints: {}
    },
    payments: {
      allow: ['payment.read', 'refund.create'],
      deny: ['payment.capture', 'refund.delete'],
      constraints: {}
    }
  },
  authority: {
    ticket: { kind: 'helpdesk.ticket', value: ticketId }
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

let ticketReads = 0;
let orderReads = 0;
let paymentReads = 0;
let refunds = 0;

console.log('Task: Resolve one support ticket by refunding no more than the payment discovered through that ticket');

console.log('1. Read the exact authorized ticket');
const ticket = await task.run({
  service: 'helpdesk',
  action: 'ticket.read',
  context: { ticket_id: ticketId }
}, async () => {
  ticketReads += 1;
  return { ticket_id: ticketId, customer_id: 'customer:77', order_id: 'order:991' };
});

const order = task.authorityFrom(ticket, {
  name: 'order',
  kind: 'commerce.order',
  from: 'ticket',
  extractor: orderIdExtractor
});
console.log(`   authority -> ${order.value}`);

console.log('2. Read only the order established by the ticket');
const orderRead = await task.run({
  service: 'commerce',
  action: 'order.read',
  context: { order_id: order.value }
}, async () => {
  orderReads += 1;
  return { order_id: order.value, payment_id: 'payment:abc123' };
});

const payment = task.authorityFrom(orderRead, {
  name: 'payment',
  kind: 'payments.payment',
  from: 'order',
  extractor: paymentIdExtractor
});
console.log(`   authority -> ${payment.value}`);

console.log('3. Read only the payment established by the order');
const paymentRead = await task.run({
  service: 'payments',
  action: 'payment.read',
  context: { payment_id: payment.value }
}, async () => {
  paymentReads += 1;
  return { payment_id: payment.value, amount_minor: 12500, currency: 'USD' };
});

const amount = task.authorityFrom(paymentRead, {
  name: 'paymentAmount',
  kind: 'money.minor-units',
  from: 'payment',
  extractor: paymentAmountExtractor
});
const currency = task.authorityFrom(paymentRead, {
  name: 'paymentCurrency',
  kind: 'money.currency',
  from: 'payment',
  extractor: paymentCurrencyExtractor
});
console.log(`   authority -> at most ${amount.value} minor units ${currency.value}`);

console.log('4. Execute a legitimate partial refund below the evidence-derived maximum');
await task.run({
  service: 'payments',
  action: 'refund.create',
  context: {
    payment_id: payment.value,
    amount_minor: 5000,
    currency: currency.value
  }
}, async () => {
  refunds += 1;
  return { refund_id: 'refund:partial-1', status: 'succeeded' };
});
console.log('   ALLOW -> partial refund executed under max authority');

async function proveRefundBlocked(label, context) {
  try {
    await task.run({ service: 'payments', action: 'refund.create', context }, async () => {
      refunds += 1;
      return { refund_id: 'must-not-exist' };
    });
    throw new Error(`${label} unexpectedly executed`);
  } catch (error) {
    if (!(error instanceof AuthorityApprovalRequiredError) || error.code !== 'authority_delta_required') {
      throw error;
    }
    console.log(`   STEP-UP -> ${label} blocked before refund callback`);
    console.log(`   ${task.explain(error).summary}`);
  }
}

console.log('5. Prove unrelated payment, over-refund and wrong currency do not inherit authority');
await proveRefundBlocked('unrelated payment', {
  payment_id: 'payment:other',
  amount_minor: 5000,
  currency: currency.value
});
await proveRefundBlocked('over-refund', {
  payment_id: payment.value,
  amount_minor: 15000,
  currency: currency.value
});
await proveRefundBlocked('wrong currency', {
  payment_id: payment.value,
  amount_minor: 5000,
  currency: 'EUR'
});

if (refunds !== 1) throw new Error(`expected exactly one refund callback, got ${refunds}`);

console.log('6. Complete the task and remove the remaining refund authority');
task.complete('ticket refund completed');
try {
  await task.run({
    service: 'payments',
    action: 'refund.create',
    context: { payment_id: payment.value, amount_minor: 1000, currency: currency.value }
  }, async () => {
    refunds += 1;
    return { refund_id: 'must-not-run-after-completion' };
  });
  throw new Error('post-completion refund unexpectedly executed');
} catch (error) {
  if (!(error instanceof AuthorityDeniedError) || error.code !== 'task_lease_completed') throw error;
  console.log('   DENY -> completed task cannot refund again');
}

console.log(`Provider-shaped callbacks: tickets=${ticketReads}, orders=${orderReads}, payments=${paymentReads}, refunds=${refunds}`);
console.log('PASS -> ticket -> order -> payment -> bounded partial refund authority stayed on one evidence-derived lineage');
console.log('NOTE -> max is a per-effect ceiling, not a cumulative refund ledger; provider-side idempotency and payment state remain authoritative for aggregate refund totals');
