# CLI and job format

Paths below are relative to the current working directory. Prefer a new directory under `runs/` for a new job. Do not point `--out` at an unrelated directory: the client restricts output-directory permissions.

| Command | Credential / network behavior |
|---|---|
| `./jevrail plan JOB` | Local validation only. No credential lookup or network. |
| `./jevrail keychain-info` | Shows service/account selectors. Does not read the secret. |
| `./jevrail key-status` | Reads the selected credential and requests OpenRouter key metadata. |
| `./jevrail run JOB --out DIR` | Queries key metadata, then sends uncached decision requests. Billable. |
| `./jevrail status DIR` | Reads a local ledger summary. No network. |
| `./jevrail unlock DIR` | Removes a stale lock only if its process has exited. Keeps uncertain attempts. |

`run` always checks key metadata, even when all decisions are cached; a cache replay has zero additional **decision POSTs**, not necessarily zero network requests.

## Options

| Option | Default / accepted values |
|---|---|
| `--budget-usd` | `0.01`, total local scheduling budget |
| `--reserve-usd` | `0.002`, conservative reservation for each attempt |
| `--max-attempts` | `2`; only 429 may retry, set `1` to disable |
| `--concurrency` | `1`, accepted range 1–4 |
| `--max-items` | All pending items; positive integer limits newly processed items |
| `--allow-sanitized-text` | Off; required for business text after local anonymization and user authorization |
| `--keychain-service` | `jevrail.openrouter` |
| `--keychain-account` | Current macOS account name |

The output directory binds the job manifest and budget/retry/concurrency policy. Changing those requires a separate job; do not create a new directory merely to bypass an uncertain request. `--max-items` can change between partial runs.

## Minimal input

```json
{
  "schema_version": "jev-direct-job/1",
  "standard_version": "completion-rubric-1",
  "data_class": "synthetic",
  "model": "typesafe/jev-1.13-20260917",
  "items": [{
    "id": "sample-1",
    "state": {"log": "Synthetic example: output exists and all required checks passed."},
    "questions": {
      "complete": {
        "type": "noul",
        "instructions": "Does the log explicitly confirm that output exists and all required checks passed?"
      }
    }
  }]
}
```

The `jev-direct-job/1` schema identifier is retained from the local prototype for format continuity. Branding changes do not invalidate old manifests, but the public examples are separately translated fixtures.

- `noul`: a value from 0 to 1 for a yes/no judgment. It is not established as a calibrated real-world probability by this client.
- `choice`: predefined option labels with descriptions, returned choice and distribution.
- `score`: an ordered list of criteria; output is a position on that scale, not a success probability.

Provide neutral observed evidence. Keep missing facts as `null`; do not place desired conclusions in the input. See `examples/smoke-job.json` for all three question types. Limits: 500 items per job, 16 questions per item, 32 KiB per request. The model snapshot is pinned in `src/schema.ts` and the manifest; changing it requires review and tests.

## Failure recovery

A timeout, malformed result, interruption or non-200 response other than a permitted 429 retry leaves a stopped/uncertain attempt. Inspect the local records and provider activity before deciding how to reconcile it. There is no automatic reconciliation command in this alpha.

If the process was killed, its `.run-lock` may remain. `unlock` checks that the recorded PID no longer exists; PID reuse may conservatively prevent unlocking. Removing the lock never clears the billing uncertainty.

Do not edit the ledger to claim an unknown call was free. Already in-flight requests may complete after another worker stops. Original response hashes protect against accidental modifications, not a malicious same-user rewrite of every file.
