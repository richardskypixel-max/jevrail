# Validation scope

## Public release checks

The public source was prepared from an explicit file allowlist, with no run records, account metadata, migration backups or original Git history copied into it. The public version adds a new default Keychain selector, explicit selector options, English examples and release documentation.

Run `chmod +x ./jevrail`, `npm ci --ignore-scripts` and `npm run check` to reproduce offline checks. Tests simulate the provider and cover input rejection, response contracts, cache resume, uncertain delivery, retry bounds, budget reservations, concurrency, exclusive execution, corruption detection, credential suppression and launcher behavior.

The GitHub workflow is configured for offline checks on macOS and Linux. Before the repository is uploaded, this is a configuration, not an observed successful GitHub Actions run. Live Keychain behavior is macOS-only; no Windows support is claimed.

## Earlier local smoke test

On 2026-09-25, the preceding local implementation performed three real synthetic decision calls through OpenRouter to `typesafe/jev-1.13-20260917`. The three states were completed, failed and running. All passed expectations written before the calls. Total reported cost was **$0.000074718**; repeating the completed job made zero additional decision requests.

This is a historical observation, not a price promise, benchmark or claim of statistical accuracy. Private raw receipts and account records are deliberately not included in this repository. Public English fixtures and generalized credential setup were not additionally live-tested during packaging; the public source is therefore not described as independently live-certified.

No raw media, real project content or creative judgment was evaluated. A successful response does not establish whether the model is suitable for a real production workflow.
