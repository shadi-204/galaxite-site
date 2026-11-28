# Galaxite technical audit — 2026-11-28

## Current state

- The public frontend is static HTML/CSS/JavaScript and is currently published from GitHub Pages.
- The working branch for the overhaul is `backup/pre-galaxite-overhaul-2026-11-28`. The `main` branch has not been changed by this work.
- Supabase contains 16 works and 3,849 chapter metadata rows. `site_chapter_pages` currently contains zero rows, so there are no stored reader page images yet.
- The private `galaxite-chapters` storage bucket and reader/admin storage policies exist.
- Source discovery caches include Team-X and Azora. No complete Asura adapter exists for Galaxite.
- Existing active Edge Functions include `refresh-teamx-catalog` and `solo-manga-download`. Both currently report `verify_jwt=false`; they were not modified. `refresh-teamx-catalog` has an hourly `pg_cron` caller that sends no authentication header, and the function accepts public POST requests with only a 55-minute cache cooldown. It crawls the legacy Team-X and Azora sources and updates legacy catalog/discovery data, so it is not the Galaxite ingestion worker. Confirm the legacy integration is still wanted, then add a dedicated caller secret or other authentication before launch; do not disable it until its older app dependency is confirmed.
- No OCR/image-cleanup/Arabic-typesetting worker is connected to the Galaxite publishing flow.

## Implemented in the working branch

- Added a Supabase-backed reporting module and report inbox for work/chapter reports.
- Added a live catalog loader for published works and signed chapter-page URLs.
- Connected owner work management, chapter metadata, chapter image upload/replacement, profile listing/role management, source registry, and job-queue views to Supabase.
- Added service-role-only atomic job-claim functions and stale-lock recovery for future workers.
- Restricted reports, source registry, and queue management using database role checks and RLS policies.
- Replaced demo dashboard metrics with live values; payment and promotion integrations are clearly marked inactive.
- Added GitHub Actions frontend validation on the working branch.
- Removed the obsolete Drive-import workflow from the working branch because it could replace site files and push directly to the default branch.

## Owner access and email verification

- Supabase currently has one confirmed account with the `owner` profile role.
- The previous admin frontend incorrectly required a hard-coded placeholder email before checking database permissions. The updated gate uses the signed-in Supabase user's `is_owner()` result as the authority; the email address itself no longer grants access.
- The placeholder email is no longer configured as an owner and its automatic role-promotion triggers/function have been removed from Supabase. The corresponding database migration is tracked in this repository.
- Email confirmation has not been disabled globally. Unconfirmed accounts remain subject to Supabase Auth's normal confirmation rules.
- The login flow still needs a real browser test with the existing Owner account.

## Supabase audit findings

- The report RLS policies were inspected: signed-in users can submit reports for their own user ID; report listing and status updates require admin authority.
- Published catalog reads and premium chapter-page access retain their intended public/subscriber checks. Do not remove anonymous read policies blindly; the frontend has public browsing routes.
- Supabase Security Advisor reports that leaked-password protection is disabled. Enable it in Supabase Auth password-security settings before public launch.
- Advisor warnings also include anonymous/public policy exposure and multiple permissive policies. These need table-by-table validation; the public catalog and reader paths intentionally have public reads.
- Performance Advisor reports unindexed foreign keys and unused indexes across legacy and current tables. No bulk index removal was performed because workload evidence is needed first.
- The foreign-key columns on the current Galaxite site tables were checked individually; each has a usable leading index, so no duplicate index migration was added.
- Database migration `20261128001346_remove_placeholder_owner_email_promotion` was applied and verified: the placeholder email promotion triggers/function are absent, and one confirmed Owner account remains.

## Remaining blockers before launch

1. Authenticated browser end-to-end tests for Owner login, admin access, work edits, chapter metadata, image uploads/replacements, reports, and RLS denials.
2. Upload authorized sample chapter pages; the reader cannot display real stored pages until `site_chapter_pages` has records.
3. Build and deploy the actual worker runtime: OCR, text-region detection, cleaning/inpainting, translation, Arabic font selection, text fitting/typesetting, and safe publishing.
4. Build source adapters and scheduled discovery only for sources with documented permission; leave pending/unapproved sources disabled.
5. Review both existing Edge Functions with `verify_jwt=false`, including code, schedules, and any service-role use, before enabling Galaxite automation.
6. Enable Supabase leaked-password protection and finish Auth/RLS policy review.
7. Take a full Supabase backup and verify a restore path; no full database backup was taken during this work.
8. Finish payment gateway and promotion backend integrations, or keep those panels explicitly inactive.
9. Test mobile/desktop layouts and browser console/network errors.
10. Review remaining prototype pages and any remaining localStorage-only admin/team functions before launch.

## Validation limits

- The GitHub workflow performs static checks only. It does not replace browser, auth, storage, RLS, payment, OCR, or load testing.
- No changes from the working branch have been merged into `main` or published to the public site.

## Follow-up QA and static preview build — 2026-11-28

- Fixed the PWA service worker cache cleanup so it removes only older caches using the `galaxite-mobile-` prefix. It no longer clears unrelated Cache Storage entries on the shared `github.io` origin.
- Reworked offline handling: the cached `index.html` is now a fallback only for navigation requests; missing static assets return a clear 503 response rather than an HTML document.
- Reduced install-time precache to the public site's actual runtime assets and incremented the cache version to `galaxite-mobile-v14`.
- Extended the validator to check every service-worker precache path, navigation fallback behavior, cache-prefix isolation, and successful-response-only caching.
- Added `scripts/build-galaxite-preview.mjs`. Since the site is static HTML/CSS/JavaScript, this creates a clean `dist/` package without introducing an unnecessary bundler or runtime dependency.
- Updated the branch workflow to validate, build, ZIP, and upload a `galaxite-static-preview` artifact (14-day retention).
- Successful validation and build: workflow run [46088348561](https://github.com/shadi-204/galaxite-site/actions/runs/46088348561), commit `817213dec5f1b2f796ea15c92c4a75a06f63e07d`.
- The preview artifact is available from that workflow run. It is a static package, not a new live GitHub Pages deployment.
- The production `main` branch remains unchanged; no merge or public-site replacement was performed.
- Browser end-to-end testing, real Owner login, storage uploads/signed URL checks, and RLS denial tests still require a browser session and are not certified by this build.
- The purchased sample chapter has been stitched locally into 17 sequential parts from 88 original image files; it has not yet been uploaded to Supabase or published in the reader.
- A source-only OCR batch runner has now been added under worker/ using PaddleOCR 3.x Korean/English recognition, with unit tests for numeric ordering, result normalization, coordinates, and confidence flags. The PaddleOCR package/model weights have not been installed in a worker runtime, and the runner has not yet processed all 88 pages. No worker service is deployed. Text-region/bubble classification, inpainting, Arabic translation/typesetting, and publishing remain unimplemented. The static build must not be mistaken for completion of the localization pipeline.

## Chapter 24 OCR pilot check — 2026-11-28

- The purchased test set has 88 original WebP pages. The stitched long-scroll version is only a review artifact; OCR coordinates must reference the original pages.
- A local Tesseract 5 diagnostic was run against sample originals. It missed the stylized DAMN!! bubble on page 040, misread words in the lower dialogue, and failed to reliably read the Korean sound effects on page 020. Tesseract is therefore rejected as the production OCR engine for this art style.
- The next candidate is PP-OCRv5 Korean recognition (documented to support both Korean and English), combined with manga-oriented text-region/bubble detection. It has not yet been installed, benchmarked on this chapter, or deployed.
- No page images have been uploaded to Supabase; the chapter remains a local test asset. No OCR, inpainting, translation, lettering, or auto-publishing worker is deployed.
- Detailed processing stages and pilot acceptance checks are in docs/OCR_PIPELINE_DESIGN.md.


## OCR worker code and CI tests — 2026-11-28

- Added worker/paddle_ocr_batch.py as a local batch runner around PaddleOCR 3.x with lang="korean", intended to use the PP-OCRv5 Korean model that supports Korean and English.
- The runner processes original page images in numeric order, stores per-region text/confidence/polygons/bounding boxes, flags low-confidence detections, and marks every page for human review. It has no translation, storage upload, Supabase credential, or publishing capability.
- Added worker/test_paddle_ocr_batch.py. GitHub Actions now runs Python syntax compilation and three unit tests in addition to frontend validation and static build.
- Latest verified full CI build and tests: https://github.com/shadi-204/galaxite-site/actions/runs/46089234996
- This is source code plus mocked/unit coverage only. PaddleOCR and its model weights have not been installed in a runtime; no full 88-page OCR run or accuracy benchmark has been completed.


## Live catalog integrity and reader UX — 2026-11-28

- Removed the bundled sample catalog and the browser-local `vx-works` override from the public frontend. The published catalog now comes only from `site_works` in Supabase; a database failure is shown explicitly rather than silently presenting stale sample works.
- Added explicit loading, empty, and error states for the public catalog with a retry action.
- Removed placeholder/fake reader page tiles. The reader now fetches real page rows and signed URLs, and clearly states when a chapter has metadata but no uploaded page images.
- Added a query for real published chapter metadata to support release lists.
- Removed seeded fake community posts and fake review/rating counts. The community feed and work reviews now show empty states until actual reader activity exists.
- Removed fabricated view counts and relative publication times from the ranking/release UI. The ranking is labeled by actual rating, and the dedicated latest-chapters page now queries published chapter metadata.
- Current database check: 16 published works; 3,849 published chapter metadata rows; 0 page-image rows in `site_chapter_pages`. Cover URLs are currently null for the 16 works. Thus the catalog can list titles and chapters, but it cannot show original cover art or reader pages until those assets are uploaded.
- Validation is static CI only; browser-based login, Owner dashboard, and storage upload tests still require an authenticated browser session.
