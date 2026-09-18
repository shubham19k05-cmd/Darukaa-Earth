# Darukaa.Earth

A full-stack geospatial data analytics platform for managing and visualising carbon and biodiversity projects.

> Built for the Darukaa.Earth Full-Stack Developer Hackathon. The assignment calls for React, Mapbox GL JS, Highcharts/Chart.js, Python with Flask/Django/FastAPI, PostgreSQL/PostGIS, JWT authentication, GitHub Actions, pre-commit quality checks and a public deployment. The implementation below follows those requirements.

## Product

Darukaa.Earth gives an administrator a focused workspace to:

- register and sign in with JWT authentication;
- create and browse projects;
- draw site polygons directly on a Mapbox map;
- store polygon geometry in PostgreSQL/PostGIS;
- calculate site area using PostGIS geography area;
- click a site to inspect its performance history;
- visualise carbon and biodiversity trends with Chart.js;
- run lint/build checks in CI and pre-commit hooks.

The first registered account is assigned `ADMIN`; subsequent accounts are `USER`. The current application keeps each user's projects and sites isolated.

## Architecture

```text
React + Vite
  │
  ├── Mapbox GL JS + Mapbox Draw
  ├── Chart.js
  └── REST API client
          │ HTTPS / JSON + Bearer JWT
          ▼
FastAPI
  │
  ├── JWT auth + password hashing
  ├── Project APIs
  ├── Site/GeoJSON APIs
  └── Analytics APIs
          │ SQLAlchemy / GeoAlchemy2
          ▼
PostgreSQL + PostGIS
  ├── users
  ├── projects
  ├── sites (POLYGON SRID 4326)
  └── site_metrics
```

### Repository layout

```text
darukaa-earth/
├── backend/
│   ├── app/              # FastAPI application
│   ├── Dockerfile
│   ├── requirements.txt
│   └── pyproject.toml
├── frontend/
│   ├── src/
│   │   ├── api.js
│   │   ├── main.jsx
│   │   └── styles.css
│   │   └── ...
│   └── package.json
├── .github/workflows/ci.yml
├── docker-compose.yml
├── render.yaml
├── vercel.json
├── .env.example
└── README.md
```

## Database schema

| Table | Important fields | Purpose |
|---|---|---|
| `users` | `id`, `full_name`, `email`, `password_hash`, `role` | Authentication and ownership |
| `projects` | `id`, `name`, `description`, `project_type`, `owner_id`, `created_at` | Project management |
| `sites` | `id`, `project_id`, `name`, `status`, `area_hectares`, `geometry` | Geospatial project sites |
| `site_metrics` | `site_id`, `recorded_on`, `carbon_tonnes`, `biodiversity_index` | Time-series analytics |

`sites.geometry` uses a PostGIS `POLYGON` with SRID 4326. Site area is calculated on the server with `ST_Area(...::geography)` so the longitude/latitude polygon is measured in square metres before conversion to hectares.

## Local setup

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker Desktop
- A Mapbox public access token

### 1. Database + API

```bash
docker compose up -d db
cd backend
python -m venv .venv
# macOS/Linux: source .venv/bin/activate
# Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

API: `http://localhost:8000`  
Docs: `http://localhost:8000/docs`

### 2. Frontend

```bash
cd frontend
cp ../.env.example .env
npm install
npm run dev
```

Set these values in `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000/api
VITE_MAPBOX_TOKEN=YOUR_MAPBOX_PUBLIC_TOKEN
```

Frontend: `http://localhost:5173`

### One-command database + API

```bash
docker compose up --build
```

The frontend still runs locally with Vite.

## How to demo

1. Open the frontend and create an account.
2. The first account becomes `ADMIN`.
3. Click `+` beside Projects and create a Carbon, Biodiversity, or combined project.
4. Click `+ Add site` or use the polygon control on the map.
5. Draw at least three vertices and close the polygon.
6. Name the site, select its project/status and save it.
7. The backend calculates its area with PostGIS and creates six sample time-series records so the analytics view is immediately demonstrable.
8. Click the polygon or the site in the directory to focus the map and load its chart.

## API endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/me`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/sites`
- `POST /api/sites`
- `GET /api/sites/{site_id}/analytics`
- `GET /api/dashboard/summary`
- `GET /health`

All protected endpoints require `Authorization: Bearer <token>`.

## Automated quality

Pre-commit checks:

```bash
pip install pre-commit
pre-commit install
pre-commit run --all-files
```

The hooks format/lint Python with Ruff, format frontend files with Prettier, and run the frontend ESLint check.

GitHub Actions runs backend Ruff/compile checks and frontend ESLint/build checks on pushes and pull requests.

## Deployment

### Backend — Render

`render.yaml` defines the FastAPI Docker web service. Create a PostgreSQL database with PostGIS support, then set:

- `DATABASE_URL`
- `CORS_ORIGINS=https://YOUR-VERCEL-DOMAIN.vercel.app`
- `JWT_SECRET` (Render can generate this)

Deploy the `backend` service from the repository. Confirm `/health` returns HTTP 200.

### Frontend — Vercel

Import the repository into Vercel and set:

- Framework: Vite
- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`
- `VITE_API_URL=https://YOUR-RENDER-API.onrender.com/api`
- `VITE_MAPBOX_TOKEN=YOUR_MAPBOX_PUBLIC_TOKEN`

`vercel.json` is included as a reference deployment configuration.

## Environment and security notes

- Never commit real JWT secrets, database passwords, or Mapbox tokens.
- Use HTTPS in production.
- Restrict CORS to the deployed frontend origin.
- The Mapbox token used in the browser is a public token; configure Mapbox URL restrictions for production.
- Replace the seeded analytics with real project data before production use.
- For a larger production system, add Alembic migrations, role-based admin policies, rate limiting, refresh tokens, structured logging and observability.

## Trade-offs

**FastAPI:** gives typed request validation, automatic OpenAPI documentation and a compact REST API suitable for the challenge.

**PostGIS:** keeps spatial data in the database rather than treating polygons as opaque JSON, enabling accurate area calculations and future spatial queries.

**Mapbox Draw:** makes the required polygon workflow explicit while keeping the frontend implementation lightweight.

**Seeded metrics:** provide an immediately demonstrable chart without pretending that the hackathon supplies a fixed external dataset. The README and UI make this distinction clear.

**Single-page dashboard:** keeps the core user journey—project → map → site → analytics—in one workspace, reducing navigation overhead for an administrator.

## Submission checklist

Before submitting, replace the placeholders in the Word submission document with:

- private GitHub repository URL and access invitations, or public repository URL;
- live Vercel demo URL;
- Render API URL if useful for reviewers;
- demo login credentials if you choose to provide a shared account;
- any review notes.

The hackathon brief says the Word document must contain the GitHub link, live demo URL where applicable, README overview, and any credentials/notes needed to review the project.
