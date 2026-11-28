# Run the Galaxite ingestion worker for free

The worker can run as a short GitHub Actions job instead of an always-on server. This keeps it separate from the static website and avoids Railway or another paid worker host.

## GitHub Actions setup

1. Open the repository's **Settings → Secrets and variables → Actions**.
2. Add these two **repository secrets**:
   - `SUPABASE_URL` — the Galaxite Supabase project URL.
   - `SUPABASE_SERVICE_ROLE_KEY` — the server-side Supabase service-role key. Never put it in source files, frontend code, or chat.
3. Open **Actions → Galaxite free scheduled ingestion**.
4. Choose **Run workflow**, select `galaxite-preview`, and run it manually for the first safe test.
5. Check the run log. Do not enable the Asura source until parser behavior and database writes have been verified.

The job runs one bounded queue item per invocation, with a 10-minute hard timeout. It does not keep an idle process running. It uses Python's standard library only; it does not install the OCR/model packages in `requirements.txt`.

## Important GitHub schedule limitation

GitHub executes `schedule` events only from the repository's **default branch**. The workflow is currently being prepared on `galaxite-preview`, not `main`, so its hourly schedule will not become automatic until this workflow file is approved and present on the default branch. Manual `workflow_dispatch` on `galaxite-preview` is available for testing in the meantime. No changes to `main` are made by this setup.

## Free-tier and storage limits

- This workflow is intended for a public GitHub repository using GitHub-hosted standard runners.
- Supabase Free storage is limited. Keep the existing private `galaxite-chapters` bucket for now and monitor its usage; this implementation does not migrate files or change bucket policies.
- No paid storage provider is added. Cloudflare R2 is deliberately not wired in because the site's private-bucket access and signed-URL flow must be adapted and tested first.
- GitHub schedule execution can be delayed; it is not a guaranteed real-time scheduler.

## Safety

- Sources must be explicitly authorized and enabled in Supabase.
- Imported works and chapters remain unpublished for Owner review.
- No login, paywall bypass, or access-control circumvention is implemented.
- Keep one worker invocation at a time; workflow concurrency prevents overlapping scheduled runs.
