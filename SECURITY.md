# Security policy

JevRail is alpha software, not an independently certified security product. Small readable source and zero runtime npm dependencies reduce the amount of code to review; they do not establish that software is secure.

## Intended environment

A trusted local macOS user runs the checked-out CLI, with a trusted Node.js runtime and access to a limited OpenRouter key in Keychain. Offline tools and simulated tests can run on other POSIX systems. A hostile administrator, compromised same-user process, replaced Node executable or modified checkout is outside this boundary.

## Data flow

- **Credential:** read by `/usr/bin/security` for an explicitly selected Keychain service/account; kept in process memory; used as an HTTPS Authorization header to `openrouter.ai`.
- **Decision input:** the selected job's `state` and `questions` go to OpenRouter and its TypeSafe provider. The pinned model ID goes with them. No raw media is read or uploaded.
- **Local storage:** job contents, exact HTTP response bytes, parsed answers, cost and token metadata remain in the output directory. They may still be sensitive. Owner-only permissions and `.gitignore` are not encryption or access control against the same user.
- **Telemetry:** none in this project. Provider logging/training/retention policies are controlled separately by the services and account settings.

Use the `jevrail` launcher: it removes inherited credentials, ambient proxies and Node startup injection settings before starting Node. Calling internal TypeScript modules directly bypasses part of that preparation. Corporate TLS interception or proxy environments may require a separate reviewed configuration; this release deliberately has no proxy option.

## Controls and limits

| Control | Limit |
|---|---|
| Fixed HTTPS host and no redirects | DNS, TLS roots, OS and Node must still be trusted. OpenRouter still routes to the model provider. |
| Obvious-secret / URL / contact filters | Heuristics, not a complete PII detector, DLP system or sanitizer. Operators must inspect inputs. |
| Cost reservation written before dispatch | A scheduling guard, not a provider price ceiling. In-flight calls may finish after another worker stops. |
| Uncertain calls are not resent | There is no end-to-end exactly-once guarantee or automatic refund. Reconciliation is manual. |
| Completed response hashes checked | Detects ordinary corruption against the ledger, not adversarial rewrites of both ledger and response. No signatures. |
| Process lock and owner-only files | Intended for one trusted user on a local filesystem, not a multi-tenant or network filesystem service. |
| Typed response validation | Valid structure does not establish truth, calibration, creative quality or fitness for high-stakes decisions. |

Model output is inert JSON. JevRail does not execute returned code, tool calls or instructions. Prompt injection can still bias model answers; callers should put neutral observations in `state` and treat outputs as untrusted assessments.

## Reporting a vulnerability

Do not put API keys, raw private job records or exploitable details in a public issue. If this repository's GitHub Security tab offers **Report a vulnerability**, use it for a private report. If it is unavailable, open an issue requesting a private reporting channel without sensitive details. There is no staffed response SLA in this alpha.

Describe the affected version, minimal synthetic reproduction, impact, and proposed mitigation if known. Never test against someone else's account or key.

## Before distributing a fork

Run `npm run check:release`, inspect all files to be published, and review any Git history separately. The checker is a heuristic source-tree check, not a comprehensive secret-scanning service. Do not distribute `runs/`, account metadata, local audit reports, credentials or migration backups.
