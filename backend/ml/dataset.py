import csv
import hashlib
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

DATASET_ID = "zefang-liu/phishing-email-dataset"
DATASET_REVISION = "34085a032c123ca237f314a01a67909cdea35e34"
DATASET_LICENSE = "LGPL-3.0"
DATASET_URL = (
    "https://huggingface.co/datasets/zefang-liu/phishing-email-dataset/"
    f"resolve/{DATASET_REVISION}/Phishing_Email.csv?download=true"
)
DATASET_SHA256 = "18ef4fff1acb8986f0ab01e83ede6025420c829656af5a377560fce17e153b97"
LABELS = {"Safe Email": 0, "Phishing Email": 1}
TEXT_COLUMN = "Email Text"
LABEL_COLUMN = "Email Type"
WHITESPACE = re.compile(r"\s+")


def configure_csv_field_size_limit() -> None:
    csv.field_size_limit(min(sys.maxsize, (2**31) - 1))


def normalize_for_deduplication(text: str) -> str:
    return WHITESPACE.sub(" ", text.casefold()).strip()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def prepare_dataset(source: Path, output: Path, audit_path: Path) -> dict[str, Any]:
    counts: Counter[str] = Counter()
    class_counts: Counter[str] = Counter()
    unique_texts: dict[str, tuple[str, int, int]] = {}
    conflicting_texts: set[str] = set()
    invalid_labels: Counter[str] = Counter()
    output.parent.mkdir(parents=True, exist_ok=True)

    configure_csv_field_size_limit()
    with source.open("r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        if reader.fieldnames is None or not {TEXT_COLUMN, LABEL_COLUMN}.issubset(reader.fieldnames):
            raise ValueError(f"Dataset must contain {TEXT_COLUMN!r} and {LABEL_COLUMN!r} columns")
        for row in reader:
            counts["rows_read"] += 1
            text = (row.get(TEXT_COLUMN) or "").strip()
            raw_label = (row.get(LABEL_COLUMN) or "").strip()
            if not text:
                counts["missing_text"] += 1
                continue
            if raw_label not in LABELS:
                invalid_labels[raw_label or "<missing>"] += 1
                continue
            canonical = normalize_for_deduplication(text)
            if canonical in conflicting_texts:
                counts["conflicting_label_rows_removed"] += 1
                continue
            previous = unique_texts.get(canonical)
            if previous is not None:
                if previous[1] != LABELS[raw_label]:
                    counts["conflicting_label_groups_removed"] += 1
                    counts["conflicting_label_rows_removed"] += previous[2] + 1
                    del unique_texts[canonical]
                    conflicting_texts.add(canonical)
                    continue
                counts["exact_duplicates_removed"] += 1
                unique_texts[canonical] = (previous[0], previous[1], previous[2] + 1)
                continue
            unique_texts[canonical] = (text, LABELS[raw_label], 1)

    if invalid_labels:
        raise ValueError(f"Dataset contains unsupported labels: {dict(invalid_labels)}")
    for _, label, _ in unique_texts.values():
        class_counts[next(name for name, value in LABELS.items() if value == label)] += 1
    if len(class_counts) != len(LABELS) or min(class_counts.values(), default=0) < 2:
        raise ValueError("Dataset must contain at least two examples of each expected label")
    if counts["rows_read"] == 0:
        raise ValueError("Dataset contains no records")

    with output.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=["text", "label"])
        writer.writeheader()
        for text, label, _ in unique_texts.values():
            writer.writerow({"text": text, "label": label})

    total = sum(class_counts.values())
    audit = {
        "dataset_id": DATASET_ID,
        "dataset_revision": DATASET_REVISION,
        "license": DATASET_LICENSE,
        "source_sha256": sha256_file(source),
        "rows_read": counts["rows_read"],
        "missing_text": counts["missing_text"],
        "invalid_labels": dict(invalid_labels),
        "exact_duplicates_removed": counts["exact_duplicates_removed"],
        "conflicting_label_groups_removed": counts["conflicting_label_groups_removed"],
        "conflicting_label_rows_removed": counts["conflicting_label_rows_removed"],
        "rows_retained": total,
        "class_counts": dict(class_counts),
        "class_fractions": {label: count / total for label, count in class_counts.items()},
        "majority_to_minority_ratio": max(class_counts.values()) / min(class_counts.values()),
        "label_mapping": LABELS,
    }
    audit_path.parent.mkdir(parents=True, exist_ok=True)
    audit_path.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    return audit
