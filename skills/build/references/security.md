Read this when changed behavior crosses authentication/authorization; tenant/resource ownership; secrets/credentials; untrusted input; network, file, or process execution; cryptography; or payments/regulated-data boundaries. Read it once the affected paths or the predicted change are known, and before ordering tasks, the first affected test, or the first production edit in the run. Changed behavior decides it: filenames and dependency names alone do not qualify.

# Security boundaries

Make every changed trust crossing explicit before it becomes an exploit path. The enemy is a happy-path change that treats identity, input, or a destination as already trusted. The overcorrection is a generic security audit detached from the changed behavior.

## Map the changed flow

- For each changed entry point, record `principal or source → validation and authorization → operation → resource or sink`.
- Mark each arrow that crosses a process, tenant, network, filesystem, privilege, or confidentiality boundary.
- A boundary with no changed arrow is out of scope.

## Countable checks

Each applicable numbered check needs one security-relevant negative test, because a prose claim without an executed rejection is unverified.

1. **Resource authorization.** When a principal reads or changes a tenant-owned or user-owned resource, scope the authoritative lookup by both resource identifier and tenant or owner identifier. Test a valid principal with another principal's valid resource identifier.
2. **Fail closed.** When identity, authorization, validation, key lookup, or policy evaluation errors or times out, deny before the side effect. Test the error path, not only an explicit denial.
3. **Injection.** When untrusted data reaches a query, template, header, log record, interpreter, or command, use a parameterized or typed API. Test that a payload with the destination's metacharacters stays data.
4. **Secrets.** When a secret, credential, token, or key is read, written, or transmitted, keep it out of logs, errors, telemetry, client bundles, diffs, and persisted fields the contract does not name. Test one failure path and inspect the emitted output for the secret value.
5. **Trust boundaries.** For each marked arrow, name the check that runs before the first side effect and its rejection result. A caller-supplied "trusted" flag does not replace that check.
6. **Path traversal.** When untrusted data selects a path, reject absolute paths, resolve against the allowed root, follow the repository's symlink policy, and assert the resolved path stays inside that root. Test `..`, an absolute path, and a symlink escape when symlinks are accepted.
7. **SSRF.** When untrusted data selects a URL, host, redirect, or proxy destination, parse once and allow only the required schemes and ports. Test the initial URL and a redirect to a rejected address.
8. **SSRF ranges.** Validate every resolved address and redirect, and reject loopback, link-local, private, and metadata-service ranges unless the feature names them.
9. **Replay and rate abuse.** When repeating a request can create money movement, credentials, privilege changes, persisted records, deletion, or repository-defined expensive work, enforce an idempotency key, nonce and expiry, or rate limit at the authoritative boundary. Test a duplicate and one request beyond the documented limit.
10. **Cryptography.** When behavior creates or verifies ciphertext, hashes, signatures, nonces, or keys, use the repository's established primitive and key source. Test invalid key or signature input, plus nonce or token reuse when the primitive requires uniqueness.
11. **Payments and regulated data.** When changed behavior reads, writes, or transmits payment or regulated fields, list those fields, their destination, and the principal allowed access. Test one denied principal and confirm the logs omit the fields.

## Judgment

- Enforce resource ownership at the authoritative lookup, not inferred from a preceding UI or route check.
- An observed rejection before the side effect outranks a reasoned claim that the path cannot occur.
