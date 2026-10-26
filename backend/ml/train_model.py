import argparse
import csv
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline

from ml.dataset import DATASET_ID, DATASET_LICENSE, DATASET_REVISION, configure_csv_field_size_limit
from ml.prepare_dataset import DEFAULT_AUDIT, DEFAULT_PREPARED

BACKEND_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ARTIFACT = BACKEND_ROOT / "artifacts" / "phishing-email-v1.joblib"
DEFAULT_METRICS = BACKEND_ROOT / "artifacts" / "phishing-email-v1.metrics.json"
MODEL_VERSION = "email-phishing-tfidf-v1"
TOKEN_PATTERN = re.compile(r"\w+", re.UNICODE)
SIMHASH_BITS = 64
MAX_LSH_BUCKET_SIZE = 100


def simhash(text: str) -> int:
    tokens = TOKEN_PATTERN.findall(text.casefold())
    shingles = set(zip(tokens, tokens[1:], tokens[2:])) if len(tokens) >= 3 else {tuple(tokens)}
    weights = [0] * SIMHASH_BITS
    for shingle in shingles:
        digest = hashlib.blake2b(" ".join(shingle).encode("utf-8"), digest_size=8).digest()
        fingerprint = int.from_bytes(digest, "big")
        for bit in range(SIMHASH_BITS):
            weights[bit] += 1 if fingerprint & (1 << bit) else -1
    return sum(1 << bit for bit, weight in enumerate(weights) if weight >= 0)


def near_duplicate_group_ids(texts: list[str]) -> tuple[np.ndarray, dict[str, int]]:
    signatures = [simhash(text) for text in texts]
    parents = list(range(len(texts)))

    def find(value: int) -> int:
        while parents[value] != value:
            parents[value] = parents[parents[value]]
            value = parents[value]
        return value

    def union(left: int, right: int) -> None:
        left_root = find(left)
        right_root = find(right)
        if left_root != right_root:
            parents[right_root] = left_root

    buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
    comparisons = 0
    skipped_buckets = 0
    for index, signature in enumerate(signatures):
        for band in range(8):
            key = (band, (signature >> (band * 8)) & 0xFF)
            buckets[key].append(index)
    seen_pairs: set[tuple[int, int]] = set()
    for members in buckets.values():
        if len(members) > MAX_LSH_BUCKET_SIZE:
            skipped_buckets += 1
            continue
        for offset, left in enumerate(members):
            for right in members[offset + 1:]:
                pair = (left, right)
                if pair in seen_pairs:
                    continue
                seen_pairs.add(pair)
                comparisons += 1
                if (signatures[left] ^ signatures[right]).bit_count() <= 3:
                    union(left, right)

    roots = [find(index) for index in range(len(texts))]
    root_ids = {root: group_id for group_id, root in enumerate(sorted(set(roots)))}
    groups = np.array([root_ids[root] for root in roots], dtype=np.int64)
    group_sizes = np.bincount(groups)
    report = {
        "near_duplicate_groups": int(np.count_nonzero(group_sizes > 1)),
        "emails_in_near_duplicate_groups": int(group_sizes[group_sizes > 1].sum()),
        "candidate_comparisons": comparisons,
        "oversized_lsh_buckets_skipped": skipped_buckets,
        "simhash_hamming_distance_threshold": 3,
    }
    return groups, report


def read_prepared_dataset(path: Path) -> tuple[list[str], np.ndarray]:
    texts: list[str] = []
    labels: list[int] = []
    configure_csv_field_size_limit()
    with path.open("r", encoding="utf-8", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        if reader.fieldnames != ["text", "label"]:
            raise ValueError("Prepared dataset must have exactly text,label columns")
        for row in reader:
            text = (row["text"] or "").strip()
            try:
                label = int(row["label"])
            except (TypeError, ValueError) as error:
                raise ValueError("Prepared dataset contains an invalid label") from error
            if not text or label not in (0, 1):
                raise ValueError("Prepared dataset contains empty text or an invalid label")
            texts.append(text)
            labels.append(label)
    if len(set(labels)) != 2:
        raise ValueError("Prepared dataset must contain both classes")
    return texts, np.asarray(labels, dtype=np.int8)


def stratified_group_indices(labels: np.ndarray, groups: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    all_indices = np.arange(len(labels))
    outer = StratifiedGroupKFold(n_splits=5, shuffle=True, random_state=42)
    train_validation, test = next(outer.split(all_indices, labels, groups))
    inner = StratifiedGroupKFold(n_splits=4, shuffle=True, random_state=43)
    train_relative, validation_relative = next(
        inner.split(train_validation, labels[train_validation], groups[train_validation])
    )
    train = train_validation[train_relative]
    validation = train_validation[validation_relative]
    if any(len(set(groups[left]) & set(groups[right])) for left, right in (
        (train, validation), (train, test), (validation, test)
    )):
        raise RuntimeError("Duplicate group leakage found between dataset splits")
    for split in (train, validation, test):
        if len(np.unique(labels[split])) != 2:
            raise ValueError("A stratified dataset split does not contain both labels")
    return train, validation, test


def make_pipeline(classifier: Any) -> Pipeline:
    return Pipeline([
        ("tfidf", TfidfVectorizer(
            lowercase=True,
            strip_accents="unicode",
            ngram_range=(1, 2),
            min_df=2,
            max_features=100_000,
            sublinear_tf=True,
            dtype=np.float32,
        )),
        ("classifier", classifier),
    ])


def metrics_for(pipeline: Pipeline, texts: list[str], labels: np.ndarray) -> dict[str, Any]:
    predictions = pipeline.predict(texts)
    scores = pipeline.predict_proba(texts)[:, 1]
    return {
        "accuracy": float(accuracy_score(labels, predictions)),
        "precision_phishing": float(precision_score(labels, predictions, pos_label=1, zero_division=0)),
        "recall_phishing": float(recall_score(labels, predictions, pos_label=1, zero_division=0)),
        "f1_phishing": float(f1_score(labels, predictions, pos_label=1, zero_division=0)),
        "confusion_matrix_labels_0_legitimate_1_phishing": confusion_matrix(
            labels, predictions, labels=[0, 1]
        ).tolist(),
        "roc_auc": float(roc_auc_score(labels, scores)),
    }


def train(prepared_path: Path, audit_path: Path, artifact_path: Path, metrics_path: Path) -> dict[str, Any]:
    texts, labels = read_prepared_dataset(prepared_path)
    groups, leakage_report = near_duplicate_group_ids(texts)
    train_indices, validation_indices, test_indices = stratified_group_indices(labels, groups)
    train_texts = [texts[index] for index in train_indices]
    validation_texts = [texts[index] for index in validation_indices]
    train_labels = labels[train_indices]
    validation_labels = labels[validation_indices]
    candidates = {
        "logistic_regression": LogisticRegression(
            class_weight="balanced",
            max_iter=500,
            solver="liblinear",
            random_state=42,
        ),
        "multinomial_naive_bayes": MultinomialNB(alpha=0.5),
    }
    validation_results: dict[str, Any] = {}
    for name, classifier in candidates.items():
        pipeline = make_pipeline(classifier)
        pipeline.fit(train_texts, train_labels)
        validation_results[name] = metrics_for(pipeline, validation_texts, validation_labels)
        print(f"Validation {name}: {json.dumps(validation_results[name], sort_keys=True)}")

    selected_name = max(validation_results, key=lambda name: validation_results[name]["f1_phishing"])
    selected_pipeline = make_pipeline(candidates[selected_name])
    final_texts = train_texts + validation_texts
    final_labels = np.concatenate([train_labels, validation_labels])
    selected_pipeline.fit(final_texts, final_labels)
    test_results = metrics_for(
        selected_pipeline,
        [texts[index] for index in test_indices],
        labels[test_indices],
    )

    with audit_path.open("r", encoding="utf-8") as audit_file:
        dataset_audit = json.load(audit_file)
    metrics = {
        "model_version": MODEL_VERSION,
        "dataset": {
            "id": DATASET_ID,
            "revision": DATASET_REVISION,
            "license": DATASET_LICENSE,
            "sha256": dataset_audit["source_sha256"],
            "class_counts_after_exact_deduplication": dataset_audit["class_counts"],
        },
        "feature_configuration": {
            "vectorizer": "TfidfVectorizer",
            "ngram_range": [1, 2],
            "min_df": 2,
            "max_features": 100_000,
            "sublinear_tf": True,
        },
        "split_configuration": {
            "train_fraction_approx": 0.60,
            "validation_fraction_approx": 0.20,
            "test_fraction_approx": 0.20,
            "random_seeds": [42, 43],
            "grouping": "64-bit word-trigram SimHash LSH; Hamming distance <= 3",
            **leakage_report,
            "split_rows": {
                "train": len(train_indices),
                "validation": len(validation_indices),
                "test": len(test_indices),
            },
        },
        "validation_model_comparison": validation_results,
        "selected_model": selected_name,
        "test_metrics": test_results,
        "probability_calibration": "Uncalibrated predict_proba output; treated as a model score.",
    }
    artifact_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({
        "model_version": MODEL_VERSION,
        "pipeline": selected_pipeline,
        "selected_model": selected_name,
        "feature_configuration": metrics["feature_configuration"],
    }, artifact_path, compress=3)
    metrics_path.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    print(f"Selected model: {selected_name}")
    print(f"Held-out test metrics: {json.dumps(test_results, sort_keys=True)}")
    print(f"Model artifact: {artifact_path}")
    print(f"Metrics report: {metrics_path}")
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Train and evaluate reproducible TF-IDF email classifiers.")
    parser.add_argument("--prepared", type=Path, default=DEFAULT_PREPARED)
    parser.add_argument("--audit", type=Path, default=DEFAULT_AUDIT)
    parser.add_argument("--artifact", type=Path, default=DEFAULT_ARTIFACT)
    parser.add_argument("--metrics", type=Path, default=DEFAULT_METRICS)
    args = parser.parse_args()
    train(args.prepared, args.audit, args.artifact, args.metrics)


if __name__ == "__main__":
    main()
