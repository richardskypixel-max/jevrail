# Working in JevRail

- Read README.md and SECURITY.md. Use `./jevrail` for supported production calls.
- Plan offline before a run. Real calls require user authorization for the data and spend; do not put live provider calls or credentials into tests or CI.
- Never expose keys in environment variables, arguments, source, logs, reports or commits. Keychain flags select identifiers only.
- Label simulations as simulations. Original provider bytes and observed usage are evidence; local commentary is not a provider answer.
- Preserve unknown observations as null. Do not invent facts to produce a score.
- Never delete or rewrite uncertain attempts to force a retry. Reconcile with provider usage first.
- Keep changes small, retain meaningful tests, run typecheck and relevant offline checks. Runtime dependencies require an explicit rationale.
- Exclude local runs, account metadata and private paths from public changes. CI is offline and needs no API key.
