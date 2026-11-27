# Galaxite technical audit — 2026-11-28

## Current state

- The public frontend is static HTML/CSS/JavaScript and is currently published from GitHub Pages.
- The working branch for the overhaul is `backup/pre-galaxite-overhaul-2026-11-28`. The `main` branch has not been changed by this work.
- The current UI data source is still `data.js`; several admin screens still write to browser `localStorage` and are not yet connected to shared production data.
- Supabase already contains a Galaxite catalog: 16 works and 3,849 chapter metadata rows.
- `site_chapter_pages` currently contains zero rows, so the chapter metadata is not yet backed by uploaded reader page images.
- The private `galaxite-chapters` storage bucket and reader/admin storage policies already exist.
- Existing source discovery caches include Team-X and Azora. There is no Asura adapter in the Galaxite frontend/backend yet.
- Existing active Edge Functions include catalog refresh and a separate download function. Their code must be reviewed before reuse; do not replace them blindly.
- There is no OCR/image-cleanup/Arabic-typesetting worker connected to the Galaxite publishing flow yet.

## Implemented in the working branch

- Moved password visibility controls to the physical left side on reader and admin login forms.
- Added a shared Supabase-backed reporting module.
- Added report actions on work details and chapter reader pages.
- Added a real report inbox in the authenticated admin dashboard, with open/reviewing/resolved/dismissed states.
- Added a live catalog loader that reads published works from Supabase and requests signed URLs for stored chapter pages when they exist.
- Added database support for `work` and `chapter` report targets, report details, target labels/paths, and lookup indexes.
- Restricted report listing and updates to accounts for which `public.is_admin()` is true.
- Added an owner-role check to the Supabase admin login path.
- Added a JavaScript syntax-check workflow for the working branch.
- Bumped the service-worker cache and added `reports.js` to its precache list.

## Important blockers before a public test

1. The configured owner account exists in Supabase but its email is not confirmed and its profile role is still `user`. A verified-email trigger is now in place to grant the owner role only after confirmation; the existing verified owner role is preserved as a fallback.
2. The current admin work/chapter CRUD screens still use browser-local data. They must be connected to `site_works`, `site_chapters`, `site_chapter_pages`, and the private storage bucket before reports can be repaired centrally.
3. The live catalog/page loader is in place, but chapter page images have not yet been uploaded; reader testing with real page assets remains pending.
4. OCR, text removal/inpainting, translation, font selection, typesetting, and worker orchestration remain to be built.
5. Asura and any other source adapters must remain disabled for importing/republication until the required permission is obtained. Internal testing should use user-owned or authorized sample pages.

## Validation

- The frontend JavaScript syntax workflow completed successfully on the working branch.
- The report schema and RLS policies were queried after migration.
- End-to-end browser testing of sign-in, report submission, image upload, and report resolution is still pending owner verification and a browser test session.
- No changes from this branch have been merged into `main` or published to the public site.
