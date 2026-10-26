import argparse
import hashlib
import os
import urllib.request
from pathlib import Path

from ml.dataset import DATASET_SHA256, DATASET_URL, prepare_dataset, sha256_file

BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_RAW = BACKEND_ROOT / "data" / "raw" / "Phishing_Email.csv"
DEFAULT_PREPARED = BACKEND_ROOT / "data" / "processed" / "emails.csv"
DEFAULT_AUDIT = BACKEND_ROOT / "data" / "processed" / "dataset-audit.json"


def download_dataset(destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")
    digest = hashlib.sha256()
    try:
        request = urllib.request.Request(DATASET_URL, headers={"User-Agent": "EmailTraceX-dataset-setup/1.0"})
        with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as output:
            while chunk := response.read(1024 * 1024):
                digest.update(chunk)
                output.write(chunk)
        actual_hash = digest.hexdigest()
        if actual_hash != DATASET_SHA256:
            raise ValueError(f"Dataset SHA-256 mismatch: expected {DATASET_SHA256}, received {actual_hash}")
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Download and validate the pinned phishing email dataset.")
    parser.add_argument("--raw", type=Path, default=DEFAULT_RAW, help="Path for the downloaded source CSV.")
    parser.add_argument("--prepared", type=Path, default=DEFAULT_PREPARED, help="Path for cleaned training data.")
    parser.add_argument("--audit", type=Path, default=DEFAULT_AUDIT, help="Path for the dataset audit JSON.")
    args = parser.parse_args()
    if not args.raw.exists():
        print(f"Downloading pinned dataset to {args.raw}")
        download_dataset(args.raw)
    actual_hash = sha256_file(args.raw)
    if actual_hash != DATASET_SHA256:
        raise SystemExit(f"Dataset SHA-256 mismatch: expected {DATASET_SHA256}, received {actual_hash}")
    audit = prepare_dataset(args.raw, args.prepared, args.audit)
    print(f"Prepared {audit['rows_retained']} rows at {args.prepared}")
    print(f"Label counts: {audit['class_counts']}")
    print(f"Missing text: {audit['missing_text']}; exact duplicates removed: {audit['exact_duplicates_removed']}")
    print(f"Dataset audit: {args.audit}")


if __name__ == "__main__":
    main()
