# Galaxite ingestion worker

This worker consumes **explicitly authorized Galaxite JSON feeds**. It does not scrape third-party comic sites or bypass access controls. Every imported work/chapter is created as unpublished and requires owner review. Nothing is automatically published.

## Feed contract

The authorized source must serve `https://YOUR-DOMAIN/galaxite-feed.json`:

```json
{
  "schema": "galaxite-feed-v1",
  "works": [
    {
      "title": "Example title",
      "type": "مانهوا",
      "genres": ["أكشن"],
      "description": "Description",
      "cover_url": "https://YOUR-DOMAIN/images/cover.webp",
      "chapters": [
        {
          "number": 1,
          "title": "Chapter 1",
          "pages": [
            "https://YOUR-DOMAIN/pages/chapter-1/001.webp",
            "https://YOUR-DOMAIN/pages/chapter-1/002.webp"
          ]
        }
      ]
    }
  ]
}
```

Only use content you own or have written permission to ingest. The worker restricts page URLs to the same host as the registered feed, HTTPS only, public IP addresses only, images up to 18 MiB each, 200 pages per chapter, and 100 works per feed. It rejects unknown adapters and non-authorized/disabled sources.

## Deploy in a private worker service

Use Python 3.11+ and install:

```bash
python -m pip install -r worker/requirements.txt
python worker/ingestion_worker.py
```

Set these environment variables in the worker host's secret manager (never in GitHub or browser code):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (server-side secret only)
- `SUPABASE_CHAPTERS_BUCKET=galaxite-chapters` (optional)
- `POLL_SECONDS=15` (optional)

The service-role key is highly privileged. Do not paste it into chat, commit it, or expose it to frontend code. Run one worker instance initially. The existing `claim_site_ingestion_job` RPC uses row locks to prevent two workers claiming the same job.

## Enable a source

1. Register a source URL whose host you control and which serves the feed contract above.
2. Confirm you own the content or have written permission.
3. Set adapter key to `galaxite_json_feed`, authorization status to `authorized`, and only then enable it.
4. The worker queues `discover_works` automatically at the configured polling interval.
5. Review imported items in the Galaxite admin dashboard and publish manually.

The worker currently implements scheduled `discover_works` and `fetch_chapter`. Chapter localization/OCR/cleaning/translation/typesetting are separate stages and are not claimed to be automated by this worker. Private chapter images remain in the private Storage bucket. Configure the site's signed-URL reader before exposing those images to readers.

## Safety and failure handling

- No automatic publishing.
- No generic HTML scraping, login, paywall bypass, or anti-bot circumvention.
- Redirects to other hosts, HTTP URLs, private-network targets, unsupported media, and oversized files are rejected.
- Failed jobs retry through the existing claim recovery flow; after three attempts they move to `needs_attention`.
- Never store secrets in source control. Keep model weights and downloaded chapter files out of the repository.
