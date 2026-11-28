# Galaxite OCR worker — first pilot

This is an isolated OCR-only batch runner. It does not translate, clean images, call Supabase, upload files, or publish chapters.

## Engine choice

The runner uses PaddleOCR 3.x with lang="korean". The official PP-OCRv5 model table lists the Korean recognition model as supporting both Korean and English. This fits the mixed Korean sound effects and English dialogue found in the purchased Chapter 24 sample.

## Install in a dedicated worker environment

Use Python 3.10 or 3.11 and install the CPU inference engine first:

    python -m pip install paddlepaddle==3.2.0 -i https://www.paddlepaddle.org.cn/packages/stable/cpu/

Then install the worker requirements:

    python -m pip install -r worker/requirements.txt

PaddleOCR downloads its recognition/detection model files on first initialization. Keep model weights in the worker's runtime cache; do not commit them to GitHub.

## Run against original pages

Extract the purchased chapter so each original page is a separate image, numerically named (for example 001.webp through 088.webp), then run:

    python worker/paddle_ocr_batch.py --input-dir /path/to/original-pages --output /path/to/ocr_results.json

Do not feed stitched long-scroll images into this OCR stage. Their coordinates are not the original page coordinates. Use the stitched parts only for reading and human review.

## Output and safety

- Output is JSON with page numbers, per-region text, confidence, polygons, and bounding boxes.
- Any region below the default 0.75 confidence threshold is flagged.
- Every page and region remains review_required; publishing_allowed is always false.
- A missing/empty OCR result is not treated as a clean page. It is marked for review.
- The batch continues after per-page errors and records each failure in the output JSON.

The OCR output is only the first stage. Bubble classification, sound-effect handling, chapter glossary/translation, image cleanup, Arabic RTL lettering, review UI, and approved publishing still need their own workers and tests.

## Important deployment boundary

Do not place Supabase service-role keys, translation API keys, or model credentials in browser files or GitHub. This first runner has no credentials and no automatic upload path. It must be benchmarked against the sample chapter before any production adoption.
