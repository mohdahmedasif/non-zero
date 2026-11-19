# Security Policy

## Supported versions

Non-Zero is developed on the `main` branch. Security fixes are made there on a best-effort basis. Older builds may not receive a fix.

## What is sensitive

Non-Zero keeps these on the machine that runs it:

- The `ADMIN_KEY`, which pairs browsers and resets PINs
- Profile PINs, stored only as salted scrypt hashes
- Push (VAPID) keys, used to send reminders
- The habit data itself, in the SQLite database in the data directory

Treat each of these like a password.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.

If you can, report it privately through [GitHub private vulnerability reporting](https://github.com/mohdahmedasif/non-zero/security/advisories/new). Include:

- A description of the issue and its impact
- Steps to reproduce, or a proof of concept
- The version or commit you tested

Don't include real keys, PINs or habit data in the report. Use made-up data instead.
