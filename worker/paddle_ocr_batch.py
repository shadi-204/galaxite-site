#!/usr/bin/env python3
"""Run bilingual Korean/English PP-OCRv5 on original manga pages.

This is a local/worker batch runner only. It does not translate, clean, upload,
publish, or mutate Supabase data. Every page remains review-required.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Iterable


SUPPORTED_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}


def page_number(path: Path) -> int | None:
    match = re.search(r"(\d+)", path.stem)
    return int(match.group(1)) if match else None


def sort_page_paths(paths: Iterable[Path]) -> list[Path]:
    return sorted(
        paths,
        key=lambda item: (
            page_number(item) is None,
            page_number(item) if page_number(item) is not None else 0,
            item.name.casefold(),
        ),
    )


def _to_builtin(value: Any) -> Any:
    """Convert NumPy-like values returned by PaddleOCR into JSON-safe values."""
    if hasattr(value, "tolist"):
        return _to_builtin(value.tolist())
    if hasattr(value, "item"):
        try:
            return _to_builtin(value.item())
        except (ValueError, TypeError):
            pass
    if isinstance(value, dict):
        return {str(key): _to_builtin(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_builtin(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _result_dict(prediction: Any) -> dict[str, Any]:
    payload = getattr(prediction, "json", None)
    if callable(payload):
        payload = payload()
    if payload is None and isinstance(prediction, dict):
        payload = prediction
    if not isinstance(payload, dict):
        raise TypeError(
            "PaddleOCR result did not expose a JSON dictionary. "
            "Check the installed PaddleOCR 3.x version."
        )
    payload = _to_builtin(payload)
    nested = payload.get("res")
    return nested if isinstance(nested, dict) else payload


def _bbox_from_polygon(polygon: Any) -> dict[str, float] | None:
    if not isinstance(polygon, list) or len(polygon) < 2:
        return None
    try:
        xs = [float(point[0]) for point in polygon]
        ys = [float(point[1]) for point in polygon]
    except (TypeError, ValueError, IndexError):
        return None
    left, top = min(xs), min(ys)
    return {
        "x": round(left, 2),
        "y": round(top, 2),
        "width": round(max(xs) - left, 2),
        "height": round(max(ys) - top, 2),
    }


def normalize_prediction(
    source_path: Path,
    prediction: Any,
    image_width: int,
    image_height: int,
    min_confidence: float = 0.75,
) -> dict[str, Any]:
    raw = _result_dict(prediction)
    texts = raw.get("rec_texts") or []
    scores = raw.get("rec_scores") or []
    polygons = raw.get("rec_polys") or raw.get("dt_polys") or []

    texts = _to_builtin(texts)
    scores = _to_builtin(scores)
    polygons = _to_builtin(polygons)

    if not isinstance(texts, list):
        raise TypeError("PaddleOCR rec_texts must be a list.")
    if not isinstance(scores, list):
        scores = []
    if not isinstance(polygons, list):
        polygons = []

    regions = []
    for index, raw_text in enumerate(texts):
        text = str(raw_text or "").strip()
        if not text:
            continue

        try:
            confidence = float(scores[index]) if index < len(scores) else 0.0
        except (TypeError, ValueError):
            confidence = 0.0

        polygon = polygons[index] if index < len(polygons) else None
        polygon = _to_builtin(polygon)
        low_confidence = confidence < min_confidence

        regions.append({
            "id": f"{source_path.stem}-text-{index + 1:03d}",
            "text": text,
            "confidence": round(confidence, 4),
            "low_confidence": low_confidence,
            "polygon": polygon,
            "bbox": _bbox_from_polygon(polygon),
            "review_required": True,
        })

    return {
        "page_number": page_number(source_path),
        "source_image": source_path.name,
        "image_width": int(image_width),
        "image_height": int(image_height),
        "status": "needs_review" if regions else "no_text_detected_review_page",
        "review_required": True,
        "regions": regions,
        "region_count": len(regions),
        "raw_model_output": {
            "rec_texts": texts,
            "rec_scores": scores,
        },
    }


def build_ocr_engine():
    try:
        from paddleocr import PaddleOCR
    except ImportError as exc:
        raise RuntimeError(
            "PaddleOCR is not installed. Follow worker/README.md to install "
            "PaddlePaddle CPU and PaddleOCR 3.x in a dedicated worker environment."
        ) from exc

    # The Korean PP-OCRv5 recognizer is documented to recognize Korean and English.
    return PaddleOCR(
        lang="korean",
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=False,
    )


def _read_image_size(path: Path) -> tuple[int, int]:
    try:
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError("Pillow is required to read page dimensions.") from exc
    with Image.open(path) as image:
        return image.size


def run_batch(
    input_dir: Path,
    output_file: Path,
    min_confidence: float = 0.75,
    engine: Any | None = None,
) -> dict[str, Any]:
    if not input_dir.is_dir():
        raise NotADirectoryError(f"Input directory does not exist: {input_dir}")
    if not 0.0 <= min_confidence <= 1.0:
        raise ValueError("--min-confidence must be between 0 and 1.")

    pages = sort_page_paths(
        path for path in input_dir.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_IMAGE_SUFFIXES
    )
    if not pages:
        raise FileNotFoundError(f"No supported page images found in: {input_dir}")

    ocr = engine if engine is not None else build_ocr_engine()
    results = []

    for index, page in enumerate(pages, start=1):
        print(f"[{index}/{len(pages)}] OCR {page.name}", file=sys.stderr)
        try:
            width, height = _read_image_size(page)
            predictions = list(ocr.predict(input=str(page)))
            if not predictions:
                raise RuntimeError("PaddleOCR returned no prediction object.")
            results.append(
                normalize_prediction(
                    page, predictions[0], width, height, min_confidence
                )
            )
        except Exception as exc:  # keep the batch moving; failed pages remain visible
            results.append({
                "page_number": page_number(page),
                "source_image": page.name,
                "status": "failed",
                "review_required": True,
                "error": str(exc),
                "regions": [],
                "region_count": 0,
            })

    output = {
        "schema_version": 1,
        "engine": "PaddleOCR 3.x / PP-OCRv5 Korean (Korean + English)",
        "confidence_threshold": min_confidence,
        "input_directory": input_dir.name,
        "page_count": len(results),
        "pages_with_errors": sum(page["status"] == "failed" for page in results),
        "total_text_regions": sum(page.get("region_count", 0) for page in results),
        "publishing_allowed": False,
        "human_review_required": True,
        "pages": results,
        "notice": (
            "OCR output only. Do not translate, inpaint, upload, or publish "
            "without text-region review and approval."
        ),
    }

    output_file.parent.mkdir(parents=True, exist_ok=True)
    temporary_file = output_file.with_suffix(output_file.suffix + ".tmp")
    temporary_file.write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    temporary_file.replace(output_file)
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, required=True, help="Folder of original page images")
    parser.add_argument("--output", type=Path, required=True, help="Output JSON path")
    parser.add_argument("--min-confidence", type=float, default=0.75)
    args = parser.parse_args()

    try:
        result = run_batch(args.input_dir, args.output, args.min_confidence)
    except Exception as exc:
        parser.error(str(exc))
        return 2

    print(json.dumps({
        "output": str(args.output),
        "pages": result["page_count"],
        "text_regions": result["total_text_regions"],
        "failed_pages": result["pages_with_errors"],
        "publishing_allowed": result["publishing_allowed"],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
