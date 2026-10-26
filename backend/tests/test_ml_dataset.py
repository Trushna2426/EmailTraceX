import csv

import pytest

from ml.dataset import prepare_dataset


def write_rows(path, rows):
    with path.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=["Unnamed: 0", "Email Text", "Email Type"])
        writer.writeheader()
        writer.writerows(rows)


def test_prepare_dataset_validates_labels_and_removes_exact_duplicates(tmp_path):
    source = tmp_path / "synthetic-source.csv"
    output = tmp_path / "prepared.csv"
    audit_path = tmp_path / "audit.json"
    rows = [
        {"Unnamed: 0": str(index), "Email Text": f"legitimate note {index}", "Email Type": "Safe Email"}
        for index in range(3)
    ] + [
        {"Unnamed: 0": "3", "Email Text": "click to verify your account", "Email Type": "Phishing Email"},
        {"Unnamed: 0": "4", "Email Text": "  CLICK to verify your account  ", "Email Type": "Phishing Email"},
        {"Unnamed: 0": "5", "Email Text": "urgent payment verification required", "Email Type": "Phishing Email"},
        {"Unnamed: 0": "6", "Email Text": "", "Email Type": "Safe Email"},
    ]
    write_rows(source, rows)

    audit = prepare_dataset(source, output, audit_path)

    assert audit["rows_read"] == 7
    assert audit["missing_text"] == 1
    assert audit["exact_duplicates_removed"] == 1
    assert audit["class_counts"] == {"Safe Email": 3, "Phishing Email": 2}
    with output.open("r", encoding="utf-8", newline="") as csv_file:
        assert len(list(csv.DictReader(csv_file))) == 5


def test_prepare_dataset_rejects_invalid_labels(tmp_path):
    source = tmp_path / "synthetic-source.csv"
    write_rows(source, [
        {"Unnamed: 0": "0", "Email Text": "legitimate message", "Email Type": "Safe Email"},
        {"Unnamed: 0": "1", "Email Text": "phishing message", "Email Type": "malicious"},
        {"Unnamed: 0": "2", "Email Text": "second legitimate message", "Email Type": "Safe Email"},
    ])

    with pytest.raises(ValueError, match="unsupported labels"):
        prepare_dataset(source, tmp_path / "prepared.csv", tmp_path / "audit.json")


def test_prepare_dataset_excludes_conflicting_duplicate_labels(tmp_path):
    source = tmp_path / "synthetic-source.csv"
    write_rows(source, [
        {"Unnamed: 0": "0", "Email Text": "same exact email", "Email Type": "Safe Email"},
        {"Unnamed: 0": "1", "Email Text": " SAME   EXACT EMAIL ", "Email Type": "Phishing Email"},
        {"Unnamed: 0": "2", "Email Text": "legitimate message", "Email Type": "Safe Email"},
        {"Unnamed: 0": "3", "Email Text": "verify your account", "Email Type": "Phishing Email"},
        {"Unnamed: 0": "4", "Email Text": "another legitimate message", "Email Type": "Safe Email"},
        {"Unnamed: 0": "5", "Email Text": "update your payment details", "Email Type": "Phishing Email"},
    ])

    audit = prepare_dataset(source, tmp_path / "prepared.csv", tmp_path / "audit.json")

    assert audit["conflicting_label_groups_removed"] == 1
    assert audit["conflicting_label_rows_removed"] == 2
    assert audit["rows_retained"] == 4


def test_prepare_dataset_accepts_large_email_fields(tmp_path):
    source = tmp_path / "synthetic-source.csv"
    write_rows(source, [
        {"Unnamed: 0": "0", "Email Text": "safe " + ("word " * 30_000), "Email Type": "Safe Email"},
        {"Unnamed: 0": "1", "Email Text": "second legitimate message", "Email Type": "Safe Email"},
        {"Unnamed: 0": "2", "Email Text": "verify your account", "Email Type": "Phishing Email"},
        {"Unnamed: 0": "3", "Email Text": "urgent credential update", "Email Type": "Phishing Email"},
    ])

    audit = prepare_dataset(source, tmp_path / "prepared.csv", tmp_path / "audit.json")

    assert audit["rows_retained"] == 4


def test_committed_synthetic_fixture_prepares_without_claiming_real_dataset(tmp_path):
    from pathlib import Path

    fixture = Path(__file__).parent / "fixtures" / "synthetic_emails.csv"
    audit = prepare_dataset(fixture, tmp_path / "prepared.csv", tmp_path / "audit.json")

    assert audit["dataset_id"] == "zefang-liu/phishing-email-dataset"
    assert audit["rows_retained"] == 8
    assert audit["class_counts"] == {"Safe Email": 4, "Phishing Email": 4}
