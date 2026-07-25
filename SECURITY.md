# Security Policy

## Supported versions

Criblist does not publish versioned releases yet. Security fixes are made on
the latest `main` branch only.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability.

Use [GitHub's private vulnerability reporting](https://github.com/context-dot-dev/crib-shortlist/security/advisories/new)
when it is available. If that form is unavailable, email
[hello@context.dev](mailto:hello@context.dev) with the subject
`[criblist security]`.

Include, when possible:

- A description of the issue and its potential impact
- The affected route, component, dependency, or commit
- Reproduction steps or a minimal proof of concept
- Any conditions needed to exploit it
- A suggested fix, if you have one

Do not include live credentials, access tokens, or personal data. Please allow
the maintainers time to investigate before public disclosure. We will share
status and coordinate disclosure through the private report.

Dead listings, incorrect rental details, and provider parsing failures are
usually product bugs rather than security vulnerabilities and can use the
public bug-report form.

## Deployment guidance

- Keep `CONTEXT_DEV_API_KEY`, `TURSO_AUTH_TOKEN`, and `CRON_SECRET` in the
  deployment platform's secret store.
- Use a long, random `CRON_SECRET` and rotate it if it may have been exposed.
- Never use a `NEXT_PUBLIC_` variable for a secret.
- Review dependency alerts and apply supported security updates promptly.
