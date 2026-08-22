# npm release contract

The public package name is `@nullsquare/agent-authority`.

Before any publication:

1. the release commit must pass CI, CodeQL, live GitHub validation, current AI SDK integration validation, and packed-consumer validation;
2. `npm pack` must contain the documented public exports;
3. a fresh Node.js 20 consumer must install the tarball and run the core Task Lease smoke test;
4. the optional AI SDK integration must import without making `ai` a production dependency;
5. the registry package must be public and its repository metadata must point to `https://github.com/Null-Square/agent-authority`.

After publication, verify from a fresh project with:

```bash
npm install @nullsquare/agent-authority@0.4.0
```

Then run the same consumer smoke flow through the registry-installed package. Registry verification is part of the release gate; a successful `npm publish` command alone is not sufficient.

## npm vs GitHub release surfaces

Publishing to the public npm registry does not automatically create either a GitHub Release or a GitHub Packages entry.

- **npm registry** — `npm publish --access public` publishes `@nullsquare/agent-authority` to `registry.npmjs.org` / npmjs.com. This is the package users install with `npm install`.
- **GitHub Releases** — a separate GitHub object, normally backed by a Git tag such as `v0.4.0`. A release must be created explicitly or by release automation.
- **GitHub Packages** — a separate package registry. It only appears when the package is published to GitHub's npm registry (`npm.pkg.github.com`); publishing to npmjs.com does not populate it.

Agent Authority currently uses npmjs.com as its public package registry. Therefore an empty GitHub **Packages** section is expected unless the project intentionally adopts dual publication. A GitHub **Release** is still useful for source-release discoverability and should track published versions, but it is independent from npm publication.
