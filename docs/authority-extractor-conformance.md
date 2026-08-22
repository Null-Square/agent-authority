# Authority extractor conformance

Agent Authority treats provider-derived authority as a small adapter contract, not a general semantic policy language.

The strict path is:

```text
authorized request
      |
      v
reviewed provider adapter
      |
      v
normalized provider output
      |
      +--> ALLOW receipt
      +--> execution output hash
      |
      v
adapter.authorityExtractor(request, factKind)
      |
      v
{ extractor_id, selector }
      |
      v
TaskLease.deriveFromEvidence()
      |
      v
derived authority fact
```

## Adapter requirements

A provider mapping intended to establish downstream authority SHOULD satisfy all of these:

1. **Reviewed operation mapping.** The adapter owns the mapping from Agent Authority `service` + `action` to the external provider operation.
2. **Normalized authority field.** Provider data is normalized into a small output shape before authority extraction. Credentials and unrelated raw payloads should not be copied into the authority result.
3. **Fail-closed extractor advertisement.** `adapter.authorityExtractor(request, factKind)` returns an extractor only for an explicitly supported operation/fact-kind pair. Unsupported mappings return `null`.
4. **Selector, never value.** The extractor returns `{ extractor_id, selector }`. It must not return the derived authority value itself.
5. **Operation binding.** The extractor rejects receipts from another provider action.
6. **Canonical output.** The extractor rejects malformed, ambiguous, or non-canonical normalized output.
7. **Task lineage.** `TaskLease.deriveFromEvidence()` requires an ALLOW receipt from the same mission and Task Lease plus at least one existing parent fact.
8. **Exact-output integrity.** The output passed to derivation must still hash to the output bound into the execution evidence.

This is an integrity contract inside the trusted Agent Authority host/adapter boundary. It is not provider-signed remote attestation.

## Current fixtures

### Google Gmail sender

```text
gmail:thread.read
  -> normalized sender_email
  -> google.gmail.thread.sender-email.v1
  -> email.address
```

The Gmail extractor accepts only canonical normalized `sender_email` output and selects `output.sender_email`.

### GitHub selected issue

```text
github:issue.list
  + root-bound repository
  + root-bound fixture_marker
  -> exactly one normalized marker match
  -> github.issue.list.selected-number.v1
  -> github.issue.number
```

The GitHub adapter performs marker matching against the provider response, does not expose issue bodies in the normalized output, and the extractor selects only `output.selected_issue_number` when exactly one non-pull-request issue matched.

## Shared adversarial conformance suite

`test/provider-authority-conformance.test.js` applies the same strict-path checks to both provider fixtures:

- positive derivation obtains the value from the evidence-bound output rather than caller input;
- modified output under unchanged evidence is rejected;
- execution evidence cannot be replayed under a second ALLOW receipt;
- receipt/evidence from one Task Lease cannot establish authority in another lease;
- an extractor cannot be reused with evidence from another provider operation.

Provider-specific tests additionally verify canonical normalization, exact REST mappings, extractor advertisement, and ambiguity failure.

## What conformance does not prove

Passing this contract does not prove that:

- a provider cryptographically signed the normalized result;
- the trusted host itself is non-malicious;
- a source resource has not changed since the read;
- a derived fact is automatically invalidated when provider data changes;
- an agent cannot bypass Agent Authority through a separate credential or unguarded provider path.

Those are separate trust, freshness, and deployment-boundary problems and should not be hidden inside the extractor API.
