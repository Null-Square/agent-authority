# Task-owned vs broker-owned execution

The task-first facade supports two effect ownership modes with the same Task Lease semantics.

## Application-owned effect

Use `task.run(request, callback)` when the application already owns the SDK or provider call:

```js
const result = await task.run(request, () => existingSdkCall());
```

The callback runs only after the Task Lease returns ALLOW. The task receives execution evidence for the exact callback output.

## Agent Authority connected-provider effect

Use `task.execute(request)` when the provider credential and provider adapter should stay behind Agent Authority's broker boundary:

```js
const result = await task.execute(request);
```

This requires the task to be created with an `ExecutingAuthorityRuntime`, such as the runtime produced by the local `createRuntimeEnvironment()` helper.

The connected path performs:

```text
Task Lease evaluation
      |
      +--> DENY / STEP-UP -> stop before provider readiness or credential resolution
      |
      v
connected-provider readiness
      |
      v
credential broker resolves secret internally
      |
      v
provider adapter executes
      |
      v
sanitized output + ALLOW receipt + execution evidence
```

`task.execute()` converts broker runtime `deny` and `require_approval` results into the same `AuthorityDeniedError` and `AuthorityApprovalRequiredError` classes used by `task.run()`.

Successful connected execution can therefore feed directly into `task.authorityFrom()` when a reviewed provider extractor exists.

## Credential boundary

The provider credential belongs to the broker/runtime, not the task request. It should not be copied into:

- Mission or Task Lease authority facts;
- model/tool arguments;
- action receipts;
- execution evidence;
- provider-normalized output;
- public connection listings.

The local runtime's encrypted file vault is a developer/trusted-host reference implementation. Production applications should use an appropriate secret manager/KMS and provider-native credential lifecycle.
