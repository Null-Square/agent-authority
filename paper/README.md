# Agent Authority Paper Workspace

Target: **Computers & Security (Elsevier)**

Working title: **Selection Witnesses for Open-World Agent Authorization: Evidence-Grounded Dynamic Authority Under a Fixed Effect Ceiling**

This directory contains the journal manuscript and reproducible scientific figures derived from the closed Agent Authority V1 research package.

## Research freeze

The manuscript may summarize or analyze the frozen V1 evidence, but it must not silently change the experiment or retrofit the preregistered live evaluation.

Canonical research closure:

```text
main @ c9b805d8c7348230772333d063d308a32830e66f
```

Primary evidence sources:

```text
../RESEARCH.md
../benchmarks/task-contracts/RESULTS.md
../benchmarks/task-contracts/PAPER_RESULTS_DRAFT.md
../benchmarks/task-contracts/PAPER_RESEARCH_SPEC.md
../benchmarks/task-contracts/LIVE_EVAL_PROTOCOL.md
../benchmarks/task-contracts/LIVE_EVAL_ATTEMPTS.md
../benchmarks/task-contracts/ARTIFACT_MANIFEST.md
```

## Journal format

The working manuscript uses Elsevier's official `elsarticle` document class.

```tex
\documentclass[5p,times,twocolumn]{elsarticle}
```

The final submission export will be flattened because Elsevier Editorial Manager does not process LaTeX submissions that depend on subdirectories.

The development tree may use subdirectories for clarity.

## Directory map

```text
paper/
├── PLAN.md
├── README.md
├── LITERATURE_MAP.md
├── main.tex
├── references.bib
├── highlights.txt
├── figures/
│   ├── figure-style.css
│   ├── fig01-system-boundary.svg
│   ├── fig01-system-boundary.html
│   ├── fig02-selection-witness.svg
│   ├── fig02-selection-witness.html
│   ├── fig03-authority-state.svg
│   ├── fig03-authority-state.html
│   ├── fig04-methodology.svg
│   ├── fig04-methodology.html
│   ├── fig05-deterministic-results.svg
│   ├── fig05-deterministic-results.html
│   ├── fig06-live-results.svg
│   └── fig06-live-results.html
└── submission/
    └── generated only when the manuscript is ready to submit
```

## Figure rule

All figure masters are deterministic SVG/HTML.

Do not use generative image synthesis, screenshots, gradients, decorative 3D, or raster-only charts.

Academic figure grammar:

- white paper background;
- black/near-black text;
- thin neutral rules;
- square geometry;
- signal yellow `#F5D13A` only as a sparse semantic accent;
- direct labels instead of legends where possible;
- no branding/logo inside scientific figures;
- readable when printed in grayscale;
- text remains editable in the SVG master.

The journal PDF should include vector PDF exports derived from these SVG masters.

## Build workflow

Development:

```text
SVG/HTML master
      ↓
visual review
      ↓
vector PDF export
      ↓
LaTeX includegraphics
      ↓
working manuscript PDF
```

Submission:

```text
paper/main.tex + references.bib + vector figures
      ↓
flatten into paper/submission/
      ↓
compile from the flat directory
      ↓
submit PDF + LaTeX sources to Elsevier Editorial Manager
```

## Integrity rules

The manuscript must state all of the following clearly:

- the planned 5,088-run DeepSeek V4 Pro matrix did not complete;
- Attempt 4's successful V4 Pro trajectories were Slack only;
- missing live rows were not random;
- the live matched statistic uses 372 scenarios completed in both conditions;
- all live significance tests are exploratory/descriptive;
- the 60-task deterministic cohort helped shape the contract grammar;
- protected-effect containment is not equivalent to complete prompt-injection prevention;
- all unauthorized effects are not necessarily exact attacker-target completions;
- no further paid V1 model run is needed for this manuscript.

## Working length

Target: **11–13 pages including references**.

Hard internal ceiling: **15 pages including references**.

If the paper exceeds the ceiling, reduce repetition and move secondary detail to a reproducibility appendix or repository artifact before removing core limitations.
