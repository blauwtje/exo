Read this when changed behavior crosses authentication/authorization; tenant/resource ownership; secrets/credentials; untrusted input; network, file, or process execution; cryptography; or payments/regulated-data boundaries. Read it once the affected paths or the predicted change are known, and before ordering tasks, the first affected test, or the first production edit in the run. Changed behavior decides it: filenames and dependency names alone do not qualify.

# Security boundaries

Make every changed trust crossing explicit before it becomes an exploit path. The enemy is a happy-path change that treats identity, input, or a destination as already trusted. The overcorrection is a generic security audit detached from the changed behavior.

## Map the changed flow

- Each changed entry point → record `principal or source → validation and authorization → operation → resource or sink`.
- Mark each arrow crossing a process, tenant, network, filesystem, privilege, or confidentiality boundary.
- Boundary with no changed arrow → out of scope.

## Countable checks

Each applicable numbered check → one security-relevant negative test. Prose claim without an executed rejection = unverified.

1. **Resource authorization.** Principal reads or changes a tenant-owned or user-owned resource → scope the authoritative lookup by both resource identifier and tenant/owner identifier. Test: valid principal plus another principal's valid resource identifier.
2. **Fail closed.** Identity, authorization, validation, key lookup, or policy evaluation errors or times out → deny before the side effect. Test the error path, not only an explicit denial.
3. **Injection.** Untrusted data reaches a query, template, header, log record, interpreter, or command → parameterized or typed API. Test: payload with the destination's metacharacters stays data.
4. **Secrets.** Secret, credential, token, or key read, written, or transmitted → keep it out of logs, errors, telemetry, client bundles, diffs, and persisted fields the contract does not name. Test: one failure path, inspect emitted output for the secret value.
5. **Trust boundaries.** Each marked arrow → name the check before the first side effect and its rejection result. No caller-supplied "trusted" flag substitutes for that check.
6. **Path traversal.** Untrusted data selects a path → reject absolute paths, resolve against the allowed root, follow the repository's symlink policy, assert the resolved path stays inside that root. Test `..`, an absolute path, and a symlink escape when symlinks are accepted.
7. **SSRF.** Untrusted data selects a URL, host, redirect, or proxy destination → parse once, allow only required schemes and ports. Test the initial URL and a redirect to a rejected address.
8. **SSRF ranges.** Validate every resolved address and redirect; reject loopback, link-local, private, and metadata-service ranges unless the feature names them.
9. **Replay and rate abuse.** Repeating a request can create money movement, credentials, privilege changes, persisted records, deletion, or repository-defined expensive work → enforce an idempotency key, nonce/expiry, or rate limit at the authoritative boundary. Test a duplicate and one request beyond the documented limit.
10. **Cryptography.** Behavior creates or verifies ciphertext, hashes, signatures, nonces, or keys → repository's established primitive and key source. Test invalid key/signature input, plus nonce or token reuse when the primitive requires uniqueness.
11. **Payments and regulated data.** Changed behavior reads, writes, or transmits payment or regulated fields → enumerate those fields, their destination, and the principal allowed access. Test one denied principal; confirm logs omit the fields.

## Judgment

- Enforce resource ownership at the authoritative lookup, not inferred from a preceding UI or route check.
- Observed rejection before the side effect outranks a reasoned claim the path cannot occur.
