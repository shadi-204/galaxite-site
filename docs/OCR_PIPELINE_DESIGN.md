# Galaxite OCR, translation, and lettering pipeline

**Status: design documented; worker runtime is not implemented or deployed.**

## Findings from the purchased Chapter 24 test set

- The source archive contains 88 WebP images, each 800 pixels wide, with numeric filenames that must be sorted numerically rather than by ZIP entry order.
- The initial and final source images (001 and 088) are publisher promotional pages. They should be flagged for review, not deleted automatically.
- The chapter is mixed-language: at least one sampled story page contains English dialogue, while another contains Korean sound effects. The OCR configuration must therefore recognize both English and Korean.
- The chapter has been stitched into 17 ordered vertical WebP parts for convenient long-scroll inspection, with a manifest mapping each stitched part back to its original source pages.
- OCR, bubble detection, inpainting, and lettering should run on the **88 original pages** so every detected polygon remains in that page's coordinate system. Stitched parts are a review/export format, not the processing source of truth.

## Proposed processing stages

1. **Ingest and validate** — unpack the source archive, sort numeric page names, validate image dimensions and formats, calculate hashes, and preserve untouched originals.
2. **Classify pages** — flag promotional/outro pages and pages that need human review. Never discard a page automatically.
3. **Detect text and regions** — detect speech bubbles, narration boxes, and outside-bubble sound effects separately. Keep region polygons and page order in structured JSON.
4. **OCR** — use a bilingual Korean/English recognizer, store raw strings, confidence, language/script guess, and coordinates. Review low-confidence results before translation.
5. **Translate with chapter context** — translate English and Korean text into Arabic with a chapter glossary for names, places, titles, and recurring terminology. Keep sound-effect translation independently editable.
6. **Clean the source lettering** — generate masks from approved text regions and use a manga-suited inpainting model. Keep the untouched image and mask so a reviewer can undo or adjust cleanup.
7. **Arabic lettering** — use an Arabic font with correct shaping and RTL support, fit text within the bubble, align appropriately, preserve stroke/outline where useful, and flag any overflow rather than silently shrinking text too far.
8. **Human review** — provide a before/after view, original OCR, proposed Arabic text, confidence, and editable masks. A chapter must not publish automatically until approved.
9. **Export and publish** — save each processed page separately, generate stitched review output, then upload only approved files to the private Galaxite chapter bucket and mark the job ready/published.

## Initial model direction

- PaddleOCR's PP-OCRv5 multilingual documentation lists a Korean recognition model that supports **Korean and English**, making it a promising first OCR candidate for this chapter. It must still be benchmarked against the actual 88 pages before being selected for production: https://www.paddleocr.ai/main/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.html
- Manga-specific systems commonly separate bubble/text-region detection from OCR, use a manga-tuned inpainting stage, and render translated text into detected regions. This is a useful architecture reference, not an instruction to copy third-party code: https://github.com/mugenyume/mnga-tr
- We should keep OCR, translation, inpainting, and font rendering behind provider interfaces so the OCR engine or translation provider can be changed without rewriting the dashboard.

## Runtime and security boundary

- Supabase remains the source of truth for chapters, job state, and approved output metadata.
- The existing atomic queue-claim RPC functions are intended for a trusted worker using the Supabase service role. The service-role key must remain on the server and must never be placed in browser JavaScript or the public repository.
- Heavy OCR and image restoration models should run in a separate worker container/runtime, not inside the public static site. The exact VPS/hosting target is intentionally deferred until the site and workload have been validated.
- API credentials, model weights, and source images must not be committed to GitHub. Credentials should be configured as server-side environment secrets.
- Default state is **review required**. Failed OCR, uncertain translations, or text overflow must remain in the processing queue rather than publishing partially processed pages.

## Acceptance checks for the first pilot

- All 88 source pages are accounted for, numerically ordered, and hash-preserved.
- Promotional pages are clearly identified and awaiting a human keep/remove decision.
- English dialogue and Korean sound effects are detected and transcribed separately with page coordinates.
- Every translation can be edited before lettering.
- Arabic glyph shaping, RTL order, punctuation, and line breaks render correctly.
- Text does not spill outside its approved region; any overflow is reported.
- The original image can be restored for any failed or rejected inpainting result.
- Only an approved result can move to the published chapter bucket.

## Diagnostic OCR trial performed on the actual chapter

A local Tesseract 5 pass was tested against the original images using the installed English and Korean language data (`eng+kor`, full-page OCR):

- Page 040: the OCR found much of the lower English balloon, but confused **INGRID** with **INGRIO** and **AND** with **ANO**; it missed the separate stylized **DAMN!!** balloon entirely, even after testing multiple page-segmentation modes and a focused crop.
- Page 020: the recognizer did not reliably transcribe the large stylized Korean sound effects; output was mostly isolated digits/fragments.
- Conclusion: Tesseract is useful as a quick diagnostic baseline but is **not acceptable** for automatic translation or cleanup on this art style. Do not pass its raw output into the translation or publishing stages.

The first candidate for a proper benchmark is PaddleOCR PP-OCRv5 with `lang="korean"`: the official model table lists the Korean recognition model as supporting both Korean and English. PP-OCRv5 also exposes text polygons and recognition results, which can be stored in the page coordinate system. This remains a candidate, not a benchmark result; it must still be run on the chapter before acceptance: https://www.paddleocr.ai/main/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.html
