# Deploy the Galaxite ingestion worker

The worker is a private background service, separate from the static Galaxite website.

## Railway (Docker)

1. Create a new Railway service from this repository.
2. Set the service root directory to /worker.
3. Railway should detect the Dockerfile automatically.
4. Add these variables in the Railway service's Variables panel:
   - SUPABASE_URL — the Galaxite Supabase project URL.
   - SUPABASE_SERVICE_ROLE_KEY — the server-side service-role key. Never put it in GitHub, the website, or chat.
   - POLL_SECONDS — optional, default 15.
   - ASURA_BROWSE_PAGES — optional, default 22.
   - ASURA_INITIAL_CHAPTERS — optional, default 3.
5. Deploy one replica only.
6. Check logs for 'Galaxite ingestion worker started'.
7. Keep the Asura source disabled until the worker is confirmed running and the source configuration is reviewed.

## Important

- Do not add SUPABASE_SERVICE_ROLE_KEY to repository files or frontend variables.
- The service currently runs as a background worker; it does not expose a public HTTP endpoint.
- The source must be enabled in Supabase only after deployment is verified. When enabled, the worker begins scheduling discovery jobs.
- Initial discovery is paginated and bounded. It imports metadata and queues page downloads for the newest three chapters per series by default.
- Imported works and chapters stay unpublished. Review them in the Owner dashboard before publishing.
