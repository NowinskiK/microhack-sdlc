# OctoSupply API (C#)

ASP.NET Core (.NET 10) port of the OctoSupply API.

## Run

```bash
dotnet restore
dotnet run
```

Default API URL: `http://localhost:3000`

## Environment

- `PORT` (default: `3000`)
- `DB_FILE` (default: `./data/app.db`)
- `DB_MIGRATIONS_DIR` (default: `../database/migrations`)
- `DB_SEED_DIR` (default: `../database/seed`)
- `API_CORS_ORIGINS` (comma-separated override; optional)

## Database

On startup, the API applies SQL migrations from:

- `../database/migrations/*.sql`

and seeds from:

- `../database/seed/*.sql`

Initialization runs before the API starts accepting requests. Missing migrations
or failed initialization prevents startup.

## Health

- `GET /health/live` returns 200 while the API process is responsive and does not
  query the database.
- `GET /health/ready` returns 200 after initialization while SQLite remains
  accessible, or 503 otherwise.
- Both endpoints are included in `/api-docs.json`.

## Container image

The .NET 10 image needs the API and shared SQL scripts in its build context. From
the `src/` directory:

```bash
docker build --file api-cs/Dockerfile --tag octosupply-api:local .
```

The image packages the shared migrations and seeds, listens on port 3000, and
stores SQLite at `/tmp/octosupply/app.db`. Container-local data is disposable;
do not treat Azure Files as a drop-in persistent volume because this API uses
SQLite WAL mode.

## OpenAPI

- OpenAPI JSON: `http://localhost:3000/api-docs.json`

## Tests

Run C# tests from the `src/` directory:

```bash
make test-cs
```
