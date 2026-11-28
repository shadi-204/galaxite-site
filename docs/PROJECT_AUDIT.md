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
