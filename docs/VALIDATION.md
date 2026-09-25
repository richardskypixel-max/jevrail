# Validation scope

## Public release checks

The public source was prepared from an explicit file allowlist, with no run records, account metadata, migration backups or original Git history copied into it. The public version adds a new default Keychain selector, explicit selector options, English examples and release documentation.

Run `chmod +x ./jevrail`, `npm ci --ignore-scripts` and `npm run check` to reproduce offline checks. Tests simulate the provider and cover input rejection, response contracts, cache resume, uncertain delivery, retry bounds, budget reservations, concurrency, exclusive execution, corruption detection, credential suppression and launcher behavior.

The first [hosted GitHub Actions run](https://github.com/richardskypixel-max/jevrail/actions/runs/36154247695) passed on macOS and Ubuntu: clean dependency installation, typechecking, 20 offline tests per platform, source checks and example planning. Live Keychain behavior is macOS-only; no Windows support is claimed.

## Public-source live smoke test

On 2026-09-26 (Asia/Shanghai), the published source at `9602e53f07e4d2215d4431ef5dc22e0e796d2125` ran the first item (`completed`) from the public English `examples/smoke-job.json` through OpenRouter. An existing macOS Keychain item was selected explicitly. The run allowed one item, one attempt, a $0.01 local scheduling budget and a $0.002 reservation. No retry or cache replay was performed; the other two items remained pending.

Observed result:

- Model: `typesafe/jev-1.13-20260917`; provider: TypeSafe.
- Exactly one decision POST; HTTP 200; 480 input tokens and 70 output tokens.
- Provider-reported cost: **$0.000020160**.
- `stage = complete`, `verified_complete = 0.98`, `completion_level = 4`.
- Passed the pre-existing `completed` thresholds in `acceptance-contract.json`: choice `complete`, Noul at least 0.8 and score at least 3.5.
- The persisted raw-response hash matched the ledger, and interpretation remained `null`.
- Observed decision HTTP round trip: 1,013 ms. This includes transport and is one observation, not an inference-speed benchmark.

The [30-second terminal demo](DEMO.md) records the real commands and CLI output. Private raw receipts and account metadata remain local. This verifies one public synthetic case and the existing-Keychain selector path; it does not validate the other two English cases, new Keychain item setup, other coding agents, large-batch performance or real-world scoring quality. The project remains alpha.

## Earlier local smoke test

On 2026-09-25, the preceding local implementation performed three real synthetic decision calls through OpenRouter to `typesafe/jev-1.13-20260917`. The three states were completed, failed and running. All passed expectations written before the calls. Total reported cost was **$0.000074718**; repeating the completed job made zero additional decision requests.

This is a historical observation, not a price promise, benchmark or claim of statistical accuracy. Private raw receipts and account records are deliberately not included in this repository. Public English fixtures and generalized credential setup were not additionally live-tested during initial packaging; the later one-item test is documented separately above. The public source is not described as independently live-certified.

No raw media, real project content or creative judgment was evaluated. A successful response does not establish whether the model is suitable for a real production workflow.
