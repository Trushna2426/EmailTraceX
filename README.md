# EmailTraceX

EmailTraceX is a React/Vite/TypeScript frontend and FastAPI/SQLAlchemy backend for email security review and digital forensics. It includes demo dashboards as well as authenticated, organization-scoped account and email workflows.

## Features

- Employee, SOC Analyst, and Organization Admin dashboards with server-assigned roles for authenticated sessions.
- Argon2id password hashing, HttpOnly sessions, CSRF protection, invitations, and admin provisioning.
- SOC Analyst `.eml` upload and complete raw-email paste modes. Both use the backend parser and save parsed records to the configured MySQL database.
- An organization-scoped Investigation Queue that lists persisted email records and saved ML model assessments. Missing model results do not hide records.
- Reproducible TF-IDF phishing-model training scripts, a bundled versioned model artifact, and test-only synthetic fixtures.
- Existing demo views, charts, navigation, and review workflows remain available; demo data and model output are clearly distinct.

EmailTraceX does not visit extracted URLs or execute attachments. An ML result is an uncalibrated model assessment, not a confirmed security finding. Uploaded organization emails are not training data.

## Requirements

- Node.js and npm (the lockfile is `package-lock.json`).
- Python 3.11+ (see `backend/requirements.txt`).
- MySQL 8+ for the authenticated application and MySQL integration tests.

## Local setup

Install the frontend dependencies from the project root:

```powershell
npm ci
```

The backend reads the project-root `.env`. Preserve an existing `.env`; for a new checkout, copy the template only when no local file exists:

```powershell
if (-not (Test-Path .env)) { Copy-Item backend\.env.example .env }
```

Set a private MySQL `DATABASE_URL` that targets the intended EmailTraceX database. Do not commit `.env` or use production credentials for tests. From the project root, create and install a backend virtual environment:

```powershell
py -3 -m venv backend\.venv
backend\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

Inspect the configured database migration state without changing it:

```powershell
Set-Location backend
python -m alembic current
```

Do not run migrations against an existing database unless the change is explicitly planned and approved. The current source tree includes an empty `0004_investigations.py` migration file, which causes Alembic to report that it cannot determine a revision ID. This cleanup does not modify migrations or the database. For first-time database setup, admin bootstrap, password recovery, invitation provisioning, and environment configuration, see [`backend/README.md`](backend/README.md).

Start the backend from `backend\`:

```powershell
uvicorn app.main:app --reload --env-file ..\.env
```

Start the frontend in a second terminal from the project root:

```powershell
npm run dev
```

The Vite development proxy sends `/api` requests to `http://127.0.0.1:8000` by default. Set `VITE_API_PROXY_TARGET` in the project-root `.env` to change the backend address.

## Email model and dataset

The deployed model is `backend/artifacts/phishing-email-v1.joblib`; accompanying metrics are in `backend/artifacts/phishing-email-v1.metrics.json`. The model artifact is retained as a versioned application resource. Large raw and processed training datasets are not committed; the setup script downloads and verifies the pinned public dataset. Training, evaluation, source/license, limitations, and exact commands are documented in [`backend/README.md`](backend/README.md).

## Tests and checks

Frontend, from the project root:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

Backend, from `backend\`, using an isolated temporary SQLite database:

```powershell
$env:AUTH_TEST_SQLITE = "1"
python -m pytest -q
Remove-Item Env:AUTH_TEST_SQLITE
```

The backend suite can also use a dedicated MySQL test database via `AUTH_TEST_DATABASE_URL`. Its name must end in `_test`, and the schema must already be migrated. Tests use unique data and do not reset or truncate databases. Never point test settings at production.

## Repository hygiene

Keep `.env`, local `.bolt` prompts, virtual environments, dependency folders, Python/test caches, generated build output, local database dumps, and large downloaded datasets out of Git. Keep the frontend lockfile, source, tests, migrations, dataset-preparation/training scripts, model artifact, and metrics file. The root `.gitignore` contains both project-wide and backend-specific exclusions.

## Project structure

```text
project/
├── backend/
│   ├── app/                 # FastAPI app, authentication, email parser and prediction
│   ├── artifacts/           # deployed model and evaluation metadata
│   ├── data/                # local downloaded and prepared datasets (gitignored)
│   ├── migrations/          # Alembic environment and revisions
│   ├── ml/                  # dataset preparation and model training
│   └── tests/               # backend tests and small synthetic fixture
├── public/images/           # static product images
├── src/
│   ├── components/          # dashboard, email-review and layout components
│   ├── data/                # demo-only data
│   ├── hooks/               # React hooks
│   ├── pages/               # routed screens
│   ├── services/            # frontend API/service clients
│   ├── types/               # shared frontend types
│   └── utils/               # shared helpers and tests
├── package.json
├── package-lock.json
└── README.md
```

The current migration history contains an empty `backend/migrations/versions/0004_investigations.py`; do not apply migrations until its revision metadata and the recorded database revision have been reviewed.
