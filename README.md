# Multi-Service Notes App (Docker Learning Scaffold)

A small notes app with five logical pieces: **frontend**, **backend API**, **Postgres**, **Redis**, and a **worker**. There are **no Dockerfiles or Compose files** here — you add those as the learning exercise. 

> I've made the `.env` files and dockerized the app. Grade my work. Also I *intentionally* committed env vars.

## Architecture

```
Browser → Frontend (static HTML/JS)
              ↓ HTTP
         Backend API (Express :3000)
           ↓           ↓
      Postgres       Redis
           ↑
         Worker (polls item count)
```

On a Docker Compose network, containers talk by **service name** (`db`, `cache`), not `localhost`. Env vars carry those hostnames.

## Ports (local / typical publish)

| Service   | Port | Notes                                      |
|-----------|------|--------------------------------------------|
| Frontend  | 8080 | Static files (any static server)           |
| Backend   | 3000 | REST API                                   |
| Postgres  | 5432 | Only needed on the host for local-without-Docker |
| Redis     | 6379 | Same                                       |
| Worker    | —    | No HTTP port                               |

## Environment variables

### Backend (`backend/.env.example`)

| Variable       | Default (Docker-oriented) | Purpose        |
|----------------|---------------------------|----------------|
| `PORT`         | `3000`                    | API listen     |
| `DB_HOST`      | `db`                      | Postgres host  |
| `DB_PORT`      | `5432`                    | Postgres port  |
| `DB_USER`      | `notes`                   | DB user        |
| `DB_PASSWORD`  | `notespass`               | DB password    |
| `DB_NAME`      | `notesdb`                 | Database name  |
| `REDIS_HOST`   | `cache`                   | Redis host     |
| `REDIS_PORT`   | `6379`                    | Redis port     |

**Local without Docker:** set `DB_HOST=localhost` and `REDIS_HOST=localhost`.

### Worker

Same `DB_*` vars as the backend. Optional: `POLL_INTERVAL_MS` (default `15000`).

### Frontend

`API_URL` is a constant at the top of `frontend/app.js` (default `http://localhost:3000`). When you put nginx in front and proxy `/api` to the backend, change it to `''` so the browser uses same-origin `/api/...`.

## API

| Method   | Path              | Behavior                                      |
|----------|-------------------|-----------------------------------------------|
| `GET`    | `/api/health`     | DB + Redis connectivity                       |
| `GET`    | `/api/items`      | List (Redis cache, 30s TTL, then Postgres)    |
| `GET`    | `/api/items/:id`  | One item from Postgres                        |
| `POST`   | `/api/items`      | Create `{ title, body }`; invalidates cache   |
| `DELETE` | `/api/items/:id`  | Delete; invalidates cache                     |

## Run locally without Docker

Prerequisites: **Node 18+**, Postgres, Redis. Apply the schema once:

```bash
psql -U notes -d notesdb -f db/init.sql
```

(Create user/database to match `.env` if needed.)

### 1. Backend

```bash
cd backend
cp .env.example .env
# Edit .env: DB_HOST=localhost, REDIS_HOST=localhost
npm install
npm start
```

### 2. Frontend

From the repo root (or `frontend/`):

```bash
npx --yes serve frontend -l 8080
```

Open http://localhost:8080 — the page calls `http://localhost:3000/api/...` (CORS is enabled).

### 3. Worker

```bash
cd worker
# Reuse the same DB_* as backend (export them or copy a .env)
npm install
DB_HOST=localhost npm start
```

You should see a log line every ~15s with the item count.

## Project layout

```
├── frontend/
│   ├── index.html
│   └── app.js
├── backend/
│   ├── src/
│   │   ├── index.js
│   │   ├── db.js
│   │   └── cache.js
│   ├── package.json
│   └── .env.example
├── worker/
│   ├── worker.js
│   └── package.json
├── db/
│   └── init.sql
└── README.md
```

## Next steps (you write these)

1. **Dockerfile per service**
   - Frontend: nginx image; copy static files; optional reverse-proxy of `/api` → `backend:3000`.
   - Backend / worker: Node image; `npm ci` / `npm install`; `CMD` to start.
   - Prefer official `postgres` and `redis` images (no custom Dockerfile required).

2. **`docker-compose.yml`**
   - Services: `frontend`, `backend`, `db`, `cache`, `worker`.
   - Custom **bridge network(s)** — try isolating `db` on an internal network so only `backend`/`worker` can reach it.
   - **Named volume** for Postgres data (`/var/lib/postgresql/data`).
   - **Bind mount** `./db` → `/docker-entrypoint-initdb.d` (init runs only on empty volume).
   - `depends_on` + **healthchecks** (Postgres `pg_isready`, Redis `redis-cli ping`).
   - Env from `.env` / `environment`; map host ports for frontend (and backend if you want direct API access).
   - Do **not** publish DB/Redis ports if you want to practice network isolation.

3. **Practice**
   - Restart stack → seed data survives (named volume).
   - `docker compose logs -f backend worker`
   - `docker compose exec backend sh` / `network inspect`
   - Hit API twice quickly and watch `source: cache` vs `source: db` in the list response / UI.

### Look up

- Compose networking & DNS (service names)
- `depends_on` vs healthcheck conditions
- Bind mounts vs named volumes
- nginx `proxy_pass` for `/api`
- Why init scripts in `/docker-entrypoint-initdb.d/` only run once
