# Security boundaries

Make every changed trust crossing explicit before it can become an exploit path. The enemy is a happy-path change that treats identity, input, or a destination as already trusted. The overcorrection is a generic security audit detached from the changed behavior. Run only the checks whose predicates below are true.

## Map the changed flow

For each changed entry point, record `principal or source → validation and authorization → operation → resource or sink`. Mark each arrow that crosses a process, tenant, network, filesystem, privilege, or confidentiality boundary. A boundary with no changed arrow is out of scope.

## Countable checks

1. **Trust boundaries.** For every marked arrow, name the check before the first side effect and the rejection result. No caller-supplied “trusted” flag substitutes for that check.
2. **Resource authorization.** When a principal reads or changes a tenant-owned or user-owned resource, scope the authoritative lookup by both resource identifier and tenant/owner identifier. Add a test using a valid principal and another principal's valid resource identifier.
3. **Injection.** When untrusted data reaches a query, template, header, log record, interpreter, or command, use a parameterized or typed API. Add a payload containing the destination's metacharacters and assert it remains data.
4. **Path traversal.** When untrusted data selects a path, reject absolute paths, resolve the candidate against the allowed root, follow the repository's symlink policy, and assert the resolved path stays inside that root. Test `..`, an absolute path, and a symlink escape when symlinks are accepted.
5. **SSRF.** When untrusted data selects a URL, host, redirect, or proxy destination, parse it once, allow only required schemes and ports, and validate every resolved address and redirect. Unless the feature names them, reject loopback, link-local, private, and metadata-service ranges. Test the initial URL and a redirect to a rejected address.
6. **Secrets.** When a secret, credential, token, or key is read, written, or transmitted, keep it out of logs, errors, telemetry, client bundles, diffs, and persisted fields not named by the contract. Add one failure-path test that inspects emitted output for the secret value.
7. **Fail closed.** When identity, authorization, validation, key lookup, or policy evaluation errors or times out, deny the operation before its side effect. Test the error path, not only an explicit denial.
8. **Cryptography.** When behavior creates or verifies ciphertext, hashes, signatures, nonces, or keys, use the repository's established primitive and key source. Test invalid key/signature input and nonce or token reuse when the primitive requires uniqueness.
9. **Replay and rate abuse.** When repeating a request can create money movement, credentials, privilege changes, persisted records, deletion, or repository-defined expensive work, enforce an idempotency key, nonce/expiry, or rate limit at the authoritative boundary. Test a duplicate and one request beyond the documented limit.
10. **Payments and regulated data.** When changed behavior reads, writes, or transmits payment or regulated fields, enumerate those fields, their destination, and the principal allowed to access them. Test one denied principal and confirm logs omit the fields.

Record one security-relevant negative test for every applicable numbered check. A prose claim without an executed rejection is unverified.

## Judgment

- The changed trust-boundary map determines which checks run; filenames and dependency names do not.
- Resource ownership is enforced at the authoritative lookup, not inferred from a preceding UI or route check.
- An observed rejection before the side effect outranks a reasoned claim that the path cannot occur.
