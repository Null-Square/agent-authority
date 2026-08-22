# Live Gmail → Calendar validation

This validation turns the README's Gmail → Calendar Task Lease example into a real cross-provider proof.

The narrow claim is:

> A sender discovered from one authorized Gmail thread can become exact Task Lease authority for one Calendar event attendee, while a different attendee and any post-completion retry are blocked before the Calendar mutation callback runs.

It is intentionally not a general Google OAuth product or a production onboarding flow.

## Safe fixture

Use a one-message thread sent from the validation account to itself. This keeps the proof real without inviting an unrelated person.

The live script:

1. reads the approved Gmail thread through `users.threads.get` using metadata format and only the `From` header;
2. derives `fact:sender-email` from the same-lease `ALLOW` receipt;
3. creates one private, transparent Calendar event whose attendee is exactly that derived sender;
4. attempts a different attendee and requires `authority_delta_required` before the provider callback;
5. completes the Task Lease and proves the previously authorized attendee can no longer be used;
6. deletes the temporary event as harness cleanup outside the agent-authority proof.

The event uses `sendUpdates=none` and is deleted after validation. The cleanup call is counted separately from task-side provider mutations.

## Required Google OAuth scopes

The validation credential needs only the Google permissions required for the two provider operations:

```text
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/calendar.events
```

Do not put an access token in the repository or workflow inputs.

## GitHub Actions secrets

The manual workflow `.github/workflows/live-google-validation.yml` mints a short-lived access token at runtime from these repository secrets:

```text
AA_GOOGLE_OAUTH_CLIENT_ID
AA_GOOGLE_OAUTH_CLIENT_SECRET
AA_GOOGLE_OAUTH_REFRESH_TOKEN
```

The refresh token should have been granted the Gmail read-only and Calendar event scopes above. The access token is masked and exists only for the workflow run.

## Run from GitHub Actions

Open **Actions → Live Google cross-provider validation → Run workflow** and provide:

- `gmail_thread_id`: the approved self-test Gmail thread ID;
- `calendar_id`: normally `primary`;
- `expected_sender`: optional, but recommended for a deterministic fixture.

A successful run should record the following shape:

```text
ALLOW -> Gmail returned sender <fixture account>
Derived authority -> Calendar attendee <fixture account>
ALLOW -> real Calendar event mutation executed
STEP-UP -> unrelated attendee blocked before Calendar provider mutation
DENY -> post-completion Calendar mutation blocked
Provider calls observed before cleanup: gmail_reads=1, calendar_task_mutations=1
Cleanup -> deleted temporary Calendar event
```

## Run locally with a short-lived token

```bash
export GOOGLE_ACCESS_TOKEN='...'
export AA_GOOGLE_GMAIL_THREAD_ID='...'
export AA_GOOGLE_CALENDAR_ID='primary'
export AA_GOOGLE_EXPECTED_SENDER='validation@example.com'
npm run demo:live-google
```

Prefer the refresh-token GitHub Actions workflow for repeatable validation. Do not persist the short-lived access token in shell history, source files, screenshots, or issue comments.

## What this proves

When the real provider calls are placed inside the Task Lease guard callbacks, the validation demonstrates:

- cross-provider derived authority from Gmail to Calendar;
- one exact derived attendee can be used for the real Calendar effect;
- a different attendee does not silently inherit authority;
- blocked attempts create zero additional task-side Calendar provider mutations;
- task completion removes the previously valid derived authority;
- the Google credential can remain broader than the Task Lease.

## What this does not prove

- the current host-side extraction of `sender_email` is cryptographically attested by Gmail;
- Task Lease state survives process failure;
- an agent holding an independent Google credential cannot bypass the guard;
- the validation refresh-token setup is a production credential-onboarding design;
- `sendUpdates=none` is a general invitation-delivery strategy for user-facing calendar workflows.

The purpose of this proof is to close the real cross-provider M1 validation gap and expose the next implementation problem with evidence rather than speculation.
