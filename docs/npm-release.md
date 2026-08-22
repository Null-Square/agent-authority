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
