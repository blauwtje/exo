# Security policy

## Supported versions

Only the latest release receives fixes. Update with `claude plugin update exo@blauwtje` before you report.

## Reporting a vulnerability

Report it privately through [GitHub's private vulnerability reporting](https://github.com/blauwtje/exo/security/advisories/new). Do not open a public issue for a vulnerability.

Include the exo version, your platform, the steps that reproduce it, and what an attacker gains.

## Scope

exo runs a session hook (`hooks/`) and skill scripts on your machine with your shell's permissions. A report is in scope when a skill, hook or script runs a command, reads a file, or sends data that the user did not ask for.
