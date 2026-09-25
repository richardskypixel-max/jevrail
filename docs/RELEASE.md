# Preparing a GitHub release

Suggested repository name: **jevrail**

Suggested description:

> Auditable Jev decisions through OpenRouter. A macOS-first TypeScript CLI with Keychain credentials, recorded costs, and conservative retries.

Suggested topics: `openrouter`, `jev`, `typescript`, `cli`, `macos`, `keychain`, `ai-evaluation`, `auditability`.

Version: `v0.1.0-alpha.1`. Code license: MIT. The package stays `private: true` to prevent accidental npm publication; it is still shareable as source on GitHub.

## Before upload

1. Run `chmod +x ./jevrail`, a fresh `npm ci --ignore-scripts`, then `npm run check`. Browser uploads and some archive extractors do not retain executable permissions.
2. Inspect the exact file list or archive to upload. Exclude dependencies, runs, account metadata, local review outputs, migration backups, credentials and personal paths.
3. If creating commits, use the publisher's chosen public identity or verified GitHub no-reply email. Do not assume a global Git email is intended for publication. Review any history you add.
4. Review the name, README and MIT license, then publish from the intended account. This preparation does not create a GitHub repository or upload anything.
5. Enable GitHub private vulnerability reporting, verify the default branch protection policy that fits the project, and let offline CI run. Do not add OpenRouter keys as CI secrets.
6. Once hosted checks actually pass, publish the alpha tag and release notes. Do not add a passing-CI badge before there is an observed run.

The name received a lightweight public search, not a trademark clearance. No npm name, domain or GitHub namespace has been reserved.

## Suggested release notes

JevRail's first alpha makes OpenRouter Jev decisions easier to inspect: direct requests, macOS Keychain credentials, local cost accounting, original response receipts, bounded concurrency and conservative retries. The normal CLI has zero runtime npm dependencies.

The release includes synthetic examples, English and Chinese guides, offline tests, and an explicit security boundary. The public version is early software; live credentials currently require macOS. Do not use test results as evidence of real-world model accuracy.
