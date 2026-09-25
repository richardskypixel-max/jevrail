# Contributing

Start with a small issue describing the behavior, expected result and a synthetic reproduction. The first release focuses on inspectable Jev decision calls; broader agent orchestration is outside the current scope.

## Local checks

```sh
chmod +x ./jevrail
npm ci --ignore-scripts
npm run check
```

Tests must be deterministic and credential-free. Use fake transports that are explicitly labeled as simulated. Do not add provider keys to CI, make live calls in tests, or quietly change public model snapshots or pricing assumptions.

For cost, caching, interruption or credential changes, add a behavioral regression test. Preserve original responses and keep interpretation separate. Updates to retry behavior must explain whether a failed request could already have been billed.

Avoid new runtime dependencies unless their maintenance and security benefits clearly outweigh the additional review surface. Development dependencies must be locked. Keep English and Chinese quickstarts aligned when user-facing behavior changes.

Before submitting, inspect the diff for secrets, private paths, real project material and account data. Read [SECURITY.md](SECURITY.md) for private vulnerability reporting. Contributions are made under the project's MIT license.
