# Security Policy

## Supported version

Security fixes are prepared against the active development branch, `galaxite-preview`.
The public website is a static frontend that uses a Supabase publishable key. A publishable
key is expected to be visible in browser code; database access must therefore be protected
by correctly configured Row Level Security (RLS), Storage policies, and server-side checks.

## Reporting a vulnerability

Please do not publish exploit details, credentials, personal data, or an unpatched vulnerability
in a public issue.

Use GitHub's **Report a vulnerability** action / a private security advisory for this repository.
Include:
- A concise description and affected component.
- Reproduction steps or a minimal proof of concept.
- The impact and any suggested mitigation.

Allow maintainers reasonable time to investigate and release a fix before public disclosure.

## Secrets and credentials

- Never commit `.env` files, passwords, private keys, access tokens, or Supabase
  `service_role` / secret keys.
- Browser code may contain only the Supabase project URL and publishable (or legacy anon) key.
- If a secret is exposed, revoke/rotate it immediately. Removing it in a later commit does
  not remove it from Git history.
- Store future server/worker credentials in the hosting platform's secret manager, not in Git.
- Do not use real user data or private chapter files in test fixtures.

## Scope and safe testing

Only test systems and content that you own or are explicitly authorized to test.
Do not attempt denial of service, access other users' data, or bypass third-party access controls.
