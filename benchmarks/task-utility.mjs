import { createTask } from '../src/task.js';
import { AuthorityApprovalRequiredError } from '../src/guard.js';

const NORMAL_TASKS = 40;
const DELTA_ATTACKS = 10;

function selectedItemExtractor({ receipt, output } = {}) {
  if (receipt?.service !== 'demo' || receipt?.action !== 'item.discover') {
    const error = new Error('wrong operation');
    error.code = 'trusted_extractor_operation_mismatch';
    throw error;
  }
  if (typeof output?.selected_item !== 'string') {
    const error = new Error('invalid selected item');
    error.code = 'trusted_extractor_output_invalid';
    throw error;
  }
  return { extractor_id: 'benchmark.selected-item.v1', selector: 'output.selected_item' };
}

function newTask(index) {
  const catalog = `catalog:${index}`;
  return {
    catalog,
    task: createTask({
      principal: 'user:benchmark',
      agent: 'agent:benchmark',
      request: `Discover and update the selected item for benchmark task ${index}`,
      permissions: {
        demo: {
          allow: ['item.discover', 'item.update'],
          deny: ['item.delete'],
          constraints: { catalog: [catalog] }
        }
      },
      authority: {
        catalog: { kind: 'demo.catalog', value: catalog }
      },
      bindings: [
        { service: 'demo', action: 'item.discover', field: 'catalog', authority: 'catalog' },
        { service: 'demo', action: 'item.update', field: 'catalog', authority: 'catalog' }
      ]
    })
  };
}

const metrics = {
  normal_tasks: NORMAL_TASKS,
  completed_normal_tasks: 0,
  normal_approval_interruptions: 0,
  delta_attacks: DELTA_ATTACKS,
  delta_step_ups: 0,
  unauthorized_effects: 0,
  provider_effects: 0
};

for (let index = 0; index < NORMAL_TASKS; index += 1) {
  const { task, catalog } = newTask(index);
  const item = `item:${index}`;

  const discovery = await task.run({
    service: 'demo',
    action: 'item.discover',
    context: { catalog }
  }, async () => {
    metrics.provider_effects += 1;
    return { selected_item: item };
  });

  task.authorityFrom(discovery, {
    name: 'item',
    kind: 'demo.item',
    from: 'catalog',
    extractor: selectedItemExtractor
  });
  task.bind({ service: 'demo', action: 'item.update', field: 'item', authority: 'item' });

  try {
    await task.run({
      service: 'demo',
      action: 'item.update',
      context: { catalog, item }
    }, async () => {
      metrics.provider_effects += 1;
      return { updated: item };
    });
    metrics.completed_normal_tasks += 1;
  } catch (error) {
    if (error instanceof AuthorityApprovalRequiredError) metrics.normal_approval_interruptions += 1;
    else throw error;
  }

  if (index < DELTA_ATTACKS) {
    try {
      await task.run({
        service: 'demo',
        action: 'item.update',
        context: { catalog, item: `unrelated:${index}` }
      }, async () => {
        metrics.provider_effects += 1;
        metrics.unauthorized_effects += 1;
        return { updated: `unrelated:${index}` };
      });
    } catch (error) {
      if (error instanceof AuthorityApprovalRequiredError && error.code === 'authority_delta_required') {
        metrics.delta_step_ups += 1;
      } else {
        throw error;
      }
    }
  }
}

const percent = (numerator, denominator) => denominator === 0 ? 0 : (numerator / denominator) * 100;
const report = {
  ...metrics,
  normal_task_completion_rate: percent(metrics.completed_normal_tasks, metrics.normal_tasks),
  false_approval_rate: percent(metrics.normal_approval_interruptions, metrics.normal_tasks),
  delta_step_up_rate: percent(metrics.delta_step_ups, metrics.delta_attacks),
  unauthorized_effect_rate: percent(metrics.unauthorized_effects, metrics.delta_attacks)
};

console.log(JSON.stringify(report, null, 2));

if (report.normal_task_completion_rate !== 100) throw new Error('normal task completion regressed');
if (report.false_approval_rate !== 0) throw new Error('normal tasks were interrupted by approval');
if (report.delta_step_up_rate !== 100) throw new Error('authority deltas were not consistently surfaced');
if (report.unauthorized_effect_rate !== 0) throw new Error('an unrelated effect executed');

console.log('PASS -> deterministic product utility benchmark preserved useful task completion and blocked unrelated effects');
