# Packed consumer validation

Before publishing Agent Authority, CI validates the exact npm artifact from a completely separate temporary project.

The validation does not import repository-relative source files. It:

1. runs `npm pack`;
2. creates a fresh project outside the package source tree;
3. installs the generated tarball with production dependencies only;
4. imports Agent Authority through documented package exports;
5. runs an allowed Task Lease effect;
6. verifies a different bound resource cannot execute the effect;
7. completes the Task Lease and verifies the previously allowed effect can no longer execute;
8. imports the optional Vercel AI SDK integration wrapper without installing `ai`.

This catches missing files, bad `exports`, accidental repository-relative imports, undeclared production dependencies, and accidental coupling between the framework-neutral package and optional framework integrations.

The CI job runs on Node.js 20 so the package-consumer contract remains independent of current AI SDK runtime requirements.
