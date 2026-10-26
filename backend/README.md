# EmailTraceX Authentication MVP

This service provides Employee self-registration, email-bound SOC Analyst invitations, password login, server-managed sessions, session invalidation, current-user lookup, an authenticated test endpoint, and Organization Admin-only role provisioning. Public registration never grants privileged access.

## Requirements and local setup

- Python 3.11 or newer
- MySQL 8.0 or newer
- Node.js/npm for the React frontend

From the repository root, create a virtual environment and install backend dependencies:

```powershell
py -3 -m venv backend\.venv
backend\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
if (-not (Test-Path .env)) { Copy-Item backend\.env.example .env }
```

Create a MySQL database named `emailtracex` and a database account with access only to that database. Set `DATABASE_URL` and local settings in the project-root `.env` (the backend configuration loads this file); the URL format is `mysql+pymysql://USER:PASSWORD@HOST:3306/DATABASE`. URL-encode special characters in the password. The `.env.example` values are placeholders, not usable credentials. Apply the schema and seed the default organization only when setting up a new database or after an explicitly approved migration:

```powershell
Set-Location backend
alembic upgrade head
```

Create the first organization administrator with an interactive password prompt:

```powershell
python create_admin.py
```

If the existing default-organization administrator has forgotten their password, run this local CLI from `backend\` using the database configuration in `.env`:

```powershell
python reset_admin_password.py --email admin@your-organization.example
```

Enter the new password and confirmation at the hidden prompts, then type `RESET ADMIN PASSWORD` when explicitly prompted. The command only resets the named account if it is already an Organization Admin in `DEFAULT_ORGANIZATION_ID`; it changes no roles or other users, and revokes that account's active sessions. It does not create an account or expose an HTTP recovery endpoint. Do not put a password in command-line arguments or environment variables.

Start the API from `backend\`:

```powershell
uvicorn app.main:app --reload --env-file ..\.env
```

In a second terminal, start Vite from the repository root:

```powershell
npm run dev
```

The Vite `/api` development proxy targets `http://127.0.0.1:8000` by default. Override `VITE_API_PROXY_TARGET` if needed. Generate a CSRF signing key before starting production:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Production must terminate HTTPS, set `COOKIE_SECURE=true`, use a unique `CSRF_SECRET` of at least 32 characters, configure exact `ALLOWED_ORIGINS`, use `SameSite=Lax` or stricter, and proxy `/api` to the backend over a protected network. Keep `.env` private. Development generates a process-local CSRF key when none is set.

## Environment variables

See `backend/.env.example` for the template used to create the project-root `.env`. Vite reads `VITE_API_PROXY_TARGET` from that same root environment file; no separate frontend environment template is required. `DATABASE_URL` should use MySQL with the `mysql+pymysql` driver. `DEFAULT_ORGANIZATION_ID` must match the default organization seeded by migration `0001_auth_schema` (or a future organization-specific migration). Session tokens are random opaque values; only SHA-256 token digests are stored in the database. CSRF tokens are held in an in-memory frontend request flow and a SameSite cookie, never in localStorage.

## API

- `GET /api/auth/csrf` issues a CSRF cookie and returns its value.
- `POST /api/auth/register` accepts `full_name`, `email`, and a password of at least 8 characters (maximum 1,024 UTF-8 bytes); rejects extra fields and creates Employee only.
- `POST /api/auth/register/invited` accepts registration details and an invitation token; consumes a valid, email-bound SOC Analyst invitation once.
- `POST /api/auth/login` accepts email and password, with an optional expected-role check; the expected role can only reject a mismatch and cannot assign access. A successful login sets an HttpOnly session cookie.
- `POST /api/auth/logout` revokes the server session and expires its cookie.
- `GET /api/auth/me` returns ID, email, trusted role, organization ID/name, and account status.
- `GET /api/auth/protected` is a minimal authenticated endpoint.
- `POST /api/admin/role-assignments` requires an authenticated organization administrator and assigns `soc_analyst` or `organization_admin` within that administrator's organization.
- `POST /api/admin/invitations` requires an authenticated organization administrator and issues an email-bound SOC Analyst invitation. The raw token is returned only once; only its hash is stored.
- `POST /api/emails/upload` requires an authenticated SOC Analyst session and CSRF token, parses a bounded `.eml` upload, and stores only parsed structured metadata and a 5,000-character plain-text preview (no raw email file or full HTML body).
- `POST /api/emails/paste` uses the same parser and persistence flow for complete raw email content with headers and a blank-line separator; body-only text is rejected without fabricating headers.
- `GET /api/emails` and `GET /api/emails/{id}` require an authenticated SOC Analyst and return records scoped to that analyst's organization; record IDs from another organization return 404. List pagination uses `limit` (up to 100) and `offset`.
- `POST /api/emails/{id}/prediction` requires an authenticated SOC Analyst and CSRF token, and stores a successful, organization-scoped ML assessment with the parsed record. A missing model returns 503; the saved record remains visible without a prediction.

`MAX_EMAIL_UPLOAD_BYTES` configures the upload limit (default 5 MiB). URLs are extracted but never fetched, attachments are described but never saved or executed, and parsing does not produce threat verdicts. Uploaded parsed metadata has no automated retention policy yet; plan and configure retention before using real sensitive email data.

State-changing endpoints require `X-CSRF-Token` equal to the issued CSRF cookie. Login throttling is per-process and per-client-IP; use an edge proxy or shared rate limiter before horizontally scaling.

### Role provisioning

Apply the forward-only `0003_role_invitations` migration with `alembic upgrade head` before starting the updated backend. Public registration creates Employee accounts only and rejects a supplied role field. An authorized Organization Admin creates a SOC Analyst invite through `/api/admin/invitations`; the intended email holder registers through `/api/auth/register/invited` with the invitation token. The token is stored only as a SHA-256 digest, is bound to the admin's organization and invite email, expires after seven days, and can only be consumed once.

The first Organization Admin must be created locally with `python create_admin.py` after migrations. The bootstrap command refuses to create another administrator once one exists for the configured default organization. Additional admins are provisioned by an existing Organization Admin using `/api/admin/role-assignments`; they must first create a normal Employee account with their own email. No public registration choice grants privileged access.

## Phishing email model

### Existing implementation and scope

The email parser stores message headers and a bounded plain-text preview. The frontend's public demo analysis is simulated; it is not an ML result. This repository's authenticated SOC workflow now requests predictions from the backend using an installed model artifact. It does not perform threat-intelligence enrichment, visit URLs, execute attachments, or train on uploaded organization mail.

### Dataset provenance and limitations

The reproducible training source is the pinned `Phishing Email Detection` dataset by Cyber Cop, mirrored at [Hugging Face](https://huggingface.co/datasets/zefang-liu/phishing-email-dataset) from its [original Kaggle page](https://www.kaggle.com/datasets/subhajournal/phishingemails). Dataset metadata declares **GNU LGPL-3.0**; consult the source's current license terms before redistribution or commercial use. The pinned source revision is `34085a032c123ca237f314a01a67909cdea35e34`; its CSV SHA-256 is verified by the preparation script. Setup downloads the source into `backend\data\raw\` and does not place it in Git.

The source columns are `Email Text` and `Email Type`, with labels `Safe Email` and `Phishing Email`. They are mapped only to legitimate (0) and phishing (1) respectively. The script does not relabel, infer, or rebalance examples. It audits empty text, rejects labels outside those two source values, removes exact normalized duplicates, excludes every normalized-text group with conflicting source labels, and reports observed class counts and imbalance. The source also contains a row index; that index is not used as a model feature.

The dataset is a third-party compilation, not independently verified ground truth. It can contain mislabeled or spam-like content under the phishing label, repeated campaigns/templates, older English-language mail, and source-specific artifacts. Near-duplicate grouping is approximate SimHash/LSH and skips oversized candidate buckets for bounded runtime; the report records the skipped count. These metrics do not establish production accuracy or transfer to another organization.

Training uses only this downloaded public dataset. Uploaded EmailTraceX messages remain operational records and are never added to training.

### Prepare, train, evaluate, and test

Run commands from `backend\` in the activated project virtual environment:

```powershell
python -m pip install -r requirements.txt
python -m ml.prepare_dataset
python -m ml.train_model
$env:AUTH_TEST_SQLITE = "1"
python -m pytest -q
```

`prepare_dataset` downloads the pinned dataset when needed, verifies its SHA-256, writes `data\processed\emails.csv`, and records the observed source, row and class audit in `data\processed\dataset-audit.json`. These folders are ignored by Git.

`train_model` builds exact-deduplicated and approximate near-duplicate groups before deterministic, stratified, group-disjoint train/validation/test splits. It compares TF-IDF + Logistic Regression and TF-IDF + Multinomial Naive Bayes using validation phishing F1, retrains the selected pipeline on train plus validation, and reports held-out accuracy, phishing precision/recall/F1, confusion matrix and ROC-AUC. The fixed seed and actual metrics are recorded alongside the feature and dataset versions. The model is saved under `backend\artifacts\phishing-email-v1.joblib`; metrics are saved to `backend\artifacts\phishing-email-v1.metrics.json`. Raw and processed dataset files are ignored by Git; the currently deployed model and its metrics are retained as application resources.

`tests\fixtures\synthetic_emails.csv` contains eight invented test-only messages for small preprocessing checks. It is not training evidence and is never used by the production training command.

Set `EMAIL_MODEL_PATH` to an alternate trusted artifact path if needed. Model artifacts are Python joblib/pickle files: install only artifacts produced by this project or another trusted source. The API loads an artifact lazily once per application process and returns 503 rather than a fallback prediction when it is missing or invalid.

The prediction endpoint consumes subject, sender/reply-to and the parsed plain-text preview. Its `phishing_score` is explicitly an **uncalibrated model score**, not a calibrated probability. Scores at or above 0.65 yield a phishing assessment; at or below 0.35 yield legitimate; intermediate scores are inconclusive and recommend review. Explanations list influential text features. Every response is marked as not a confirmed finding; an analyst must review it.

### Password policy

New passwords must contain at least 8 characters and no more than 1,024 UTF-8 bytes. The byte ceiling bounds work and request size while permitting long passphrases; passwords are never silently truncated. Argon2id hashing, login/session behavior and CSRF protections are unchanged. Existing password hashes and accounts are not modified.

## Tests

Run from `backend\` after installing dependencies:

```powershell
pytest
```

Tests use temporary SQLite databases when `AUTH_TEST_SQLITE=1`; otherwise the configured `AUTH_TEST_DATABASE_URL` selects MySQL. The MySQL fixture rejects URLs that are not `mysql+pymysql` or whose database name does not end in `_test`, checks the expected migration and seeded organization, and uses unique per-client test email addresses without deleting existing user data. It never creates, drops, or resets a database. Do not point either variable at production.

The MySQL test fixture currently expects revision `0003_role_invitations`. The repository also contains an empty `migrations\versions\0004_investigations.py`; Alembic cannot load that file because it declares no revision metadata. Do not run `alembic upgrade` to work around this. Repairing or applying that migration is a separate schema task; use the isolated SQLite test mode until it is reviewed.

```powershell
$env:AUTH_TEST_SQLITE = "1" # Optional: use isolated temporary SQLite instead of MySQL.
$env:AUTH_TEST_DATABASE_URL = "mysql+pymysql://USER:PASSWORD@127.0.0.1:3306/emailtracex_test"
$env:DATABASE_URL = $env:AUTH_TEST_DATABASE_URL
alembic upgrade head
$env:AUTH_TEST_SQLITE = "0"
pytest -q
```
