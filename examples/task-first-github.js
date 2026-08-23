import { createTask } from '../src/task.js';
import { AuthorityApprovalRequiredError } from '../src/guard.js';

const repository = 'Null-Square/agent-authority';

function issueNumberExtractor({ receipt, output } = {}) {
  if (receipt?.service !== 'github' || receipt?.action !== 'issue.list') {
    const error = new Error('extractor only accepts github:issue.list');
    error.code = 'trusted_extractor_operation_mismatch';
    throw error;
  }
  if (!Number.isSafeInteger(output?.selected_issue_number)) {
    const error = new Error('discovery did not produce a canonical issue number');
    error.code = 'trusted_extractor_output_invalid';
    throw error;
  }
  return {
    extractor_id: 'demo.github.selected-issue.v1',
    selector: 'output.selected_issue_number'
  };
}

const task = createTask({
  principal: 'user:demo',
  agent: 'agent:demo',
  request: 'Find issue #42 and leave one comment only on that issue',
  permissions: {
    github: {
      allow: ['issue.list', 'issue.comment'],
      deny: ['issue.close', 'repo.delete'],
      constraints: { repository: [repository] }
    }
  },
  authority: {
    repository: { kind: 'github.repository', value: repository }
  },
  bindings: [
    { service: 'github', action: 'issue.list', field: 'repository', authority: 'repository' },
    { service: 'github', action: 'issue.comment', field: 'repository', authority: 'repository' }
  ]
});

let providerEffects = 0;

console.log('Task: Find issue #42 and leave one comment only on that issue');
console.log('1. Discover the task resource through an authorized read');
const discovery = await task.run({
  service: 'github',
  action: 'issue.list',
  context: { repository }
}, async () => {
  providerEffects += 1;
  // Replace this callback with your existing GitHub SDK/provider call.
  return { selected_issue_number: 42, selected_issue_title: 'Example issue' };
});

console.log(`   ALLOW -> discovered issue #${discovery.output.selected_issue_number}`);

const issue = task.authorityFrom(discovery, {
  name: 'issue',
  kind: 'github.issue.number',
  from: 'repository',
  extractor: issueNumberExtractor
});

task.bind({
  service: 'github',
  action: 'issue.comment',
  field: 'issue_number',
  authority: 'issue'
});

console.log(`2. Authority follows the guarded result -> issue #${issue.value}`);

await task.run({
  service: 'github',
  action: 'issue.comment',
  context: { repository, issue_number: issue.value, body: 'Handled by the task.' }
}, async () => {
  providerEffects += 1;
  return { comment_id: 1001 };
});
console.log('3. ALLOW -> comment on issue #42 executed');

try {
  await task.run({
    service: 'github',
    action: 'issue.comment',
    context: { repository, issue_number: 7, body: 'This must not execute.' }
  }, async () => {
    providerEffects += 1;
    return { comment_id: 1002 };
  });
} catch (error) {
  if (!(error instanceof AuthorityApprovalRequiredError)) throw error;
  const explanation = task.explain(error);
  console.log('4. STEP-UP -> unrelated issue blocked before the provider callback');
  console.log(`   ${explanation.summary}`);
}

console.log(`Provider effects executed: ${providerEffects} (expected: 2)`);
console.log('PASS -> useful task actions proceed while unrelated account authority does not become task authority');
