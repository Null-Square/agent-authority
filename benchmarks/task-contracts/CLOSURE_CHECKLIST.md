# V1 Research Closure Checklist

Closed: **2026-08-29**

## Evidence

- [x] 60-task deterministic cohort documented.
- [x] 370/370 corrected adversarial mutant result documented.
- [x] 230/230 provider-boundary family result documented.
- [x] Attempt 3 retained with parser and balance failures visible.
- [x] Attempt 4 retained as partial Slack live-model evidence.
- [x] Matched 372-scenario DeepSeek V4 Pro analysis documented.
- [x] Negative exact-trace/semantic-envelope result documented.
- [x] Original Actions run IDs, artifact IDs, head SHAs, and SHA-256 digests recorded.
- [x] Machine-readable Attempt-3 and Attempt-4 summaries committed.
- [x] Exact raw Attempt-3 and Attempt-4 ZIPs backed up in NullSquare Product & Engineering Drive storage.

## Safety and spend

- [x] Historical DeepSeek workflow archived.
- [x] Archived DeepSeek workflow executes zero model API calls.
- [x] Active research reproduction workflow is manual only.
- [x] Active research reproduction workflow contains no paid model API secret or model call.
- [x] Obsolete paid-run trigger markers removed.
- [x] No further paid run required for V1 closure.

## Documentation

- [x] Root `README.md` presents final research result and limitations.
- [x] `RESEARCH.md` provides stable handoff entry point.
- [x] `RESULTS.md` is the definitive closure record.
- [x] `PAPER_RESEARCH_SPEC.md` reflects the final V1 evidence.
- [x] `PAPER_RESULTS_DRAFT.md` preserves exact paper-facing claim language.
- [x] `LIVE_EVAL_ATTEMPTS.md` preserves failed-attempt history.
- [x] `ARTIFACT_MANIFEST.md` preserves raw-artifact identity and integrity data.
- [x] `CONTRIBUTING.md` defines community research integrity rules.
- [x] `ROADMAP.md` separates closed V1 research from future community work and product release mechanics.
- [x] `CITATION.cff` added.

## Repository hygiene

- [x] Obsolete research trigger/status marker files removed.
- [x] Research result summaries are machine readable.
- [x] npm package file list includes research handoff and citation metadata for a future package release.
- [x] Normal repository CI passed on the final closure branch head before merge.

## Remaining work outside V1 closure

These items are intentionally not blockers:

- [ ] choose the paper venue;
- [ ] adopt its manuscript template;
- [ ] write the full paper and figures;
- [ ] refresh the related-work novelty audit before submission claims;
- [ ] decide whether the selected venue requires new baselines, ablations, or formal proofs;
- [ ] publish/verify the next npm release when CI/release capacity is available.

V1 experimental collection is closed. New experiments must answer a new research question.
