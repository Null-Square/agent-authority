# v0.4 clear path

This milestone intentionally validates one thing:

> A normal agent application can keep its existing provider credentials and SDKs while Agent Authority gives each task narrower, temporary resource authority.

## Primary path

```text
human task
  -> Task Lease
  -> guard.run(action, effect)
  -> ALLOW / DENY / authority delta
  -> existing SDK or API
```

## Validation scenario

```text
"Handle this demo request"
  -> root: one Gmail thread
  -> authorized read
  -> derive sender from the same Task Lease receipt
  -> bind Calendar attendee to that sender
  -> exact attendee succeeds
  -> another attendee requires step-up
  -> complete task
  -> later calls fail
```

## Must be true

- Mission policy remains the ceiling.
- Derived authority cannot cross Task Leases.
- Derived authority must descend from an existing task fact.
- The trusted extraction selector is recorded.
- Denied and step-up actions never invoke the side-effect callback.
- Task completion removes task authority independently of provider credentials.

## Deliberately deferred

Do not expand v0.4 to solve these until the primary path has external validation:

- persistent Task Lease storage;
- automatic application of approved authority deltas;
- cryptographic proof of output extraction;
- browser OAuth onboarding;
- remote ChatGPT app UX;
- broad connector coverage;
- multi-agent delegation UI;
- a new authorization protocol or policy language.

Those are follow-on questions, not requirements for proving the developer primitive.
