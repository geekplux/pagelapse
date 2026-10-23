# Security policy

## Supported versions

Pagelapse has no releases yet. Security fixes go to the `main` branch and to the hosted demo at https://pagelapse.geekplux.com.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

1. Use GitHub's private reporting: the **Security** tab of [geekplux/pagelapse](https://github.com/geekplux/pagelapse), then **Report a vulnerability**.
2. If that button is missing, open an issue titled "Security contact request" with no details, and a maintainer will contact you privately.

Please include what an attacker could do, the steps to reproduce, and the affected URL or file. We aim to reply within a week. We will credit you in the fix unless you prefer otherwise.

## What is in scope

- The Worker's API (`/api/*`): URL validation (IP addresses and local host names are refused), rate limits, caching and error handling.
- The live replay frame: archived pages run in a sandboxed iframe (`allow-scripts allow-same-origin`, no top navigation, popups or forms) loaded from `web.archive.org`.
- Anything that could make Pagelapse send excessive traffic to the Internet Archive.
- Secrets: none are needed to run Pagelapse, and none should ever be committed.

Content of archived pages, and the archives themselves, are out of scope: please report those to the archive concerned.
