# Agent Evaluation Platform

Local foundation for defining agents, tasks, and the persistence model used by later experiment runs. This milestone stores data and exposes the agent and task APIs. It does not execute agents or score runs.

## Prerequisites

- macOS
- Node.js 20 or newer
- npm 11

## Setup

```bash
npm install
cp .env.example .env
npm run db:deploy
npm run dev
```

`npm run dev` builds the shared package, then starts the API on port 3000 and the web app on port 5173.

`npm test` uses a temporary SQLite file and does not touch `apps/api/data/dev.db`. Jest loads NestJS through Node's VM modules, so the test script sets `--experimental-vm-modules`. That flag is only for the test runner. The API process does not need it.

The API reads `.env` from the repository root. Relative SQLite paths are resolved from `apps/api`, so the default database file is `apps/api/data/dev.db`.

The browser calls `http://localhost:3000/api/v1` unless `apps/web/.env.local` sets `VITE_API_BASE_URL`. Do not put the database URL or secrets in a `VITE_` variable.

## Commands

| Command               | Purpose                                                       |
| --------------------- | ------------------------------------------------------------- |
| `npm install`         | Install workspace dependencies and generate the Prisma client |
| `npm run dev`         | Start the API and web app together                            |
| `npm run db:migrate`  | Create and apply a development migration                      |
| `npm run db:deploy`   | Apply committed migrations                                    |
| `npm run db:generate` | Generate the Prisma client                                    |
| `npm run db:validate` | Validate `schema.prisma`                                      |
| `npm test`            | Run the API test suite against a temporary SQLite database    |
| `npm run typecheck`   | Type-check shared, API, and web packages                      |
| `npm run lint`        | Lint the workspace                                            |
| `npm run format`      | Format the workspace with Prettier                            |
| `npm run check`       | Run format, lint, Prisma validate, typecheck, and tests       |

## API

All routes are under `/api/v1`.

- `GET /health`
- `GET /agents`, `POST /agents`, `GET /agents/:id`, `PUT /agents/:id`, `PUT /agents/:id/configuration`
- `GET /tasks`, `POST /tasks`, `GET /tasks/:id`, `PUT /tasks/:id`

List routes accept `page` and `pageSize`. `pageSize` cannot exceed 100.

`PUT /agents/:id/configuration` replaces the agent draft. It does not publish an immutable configuration version.

Successful responses use `{ success, data, meta }`. Errors use `{ success: false, error: { code, message, details }, meta }`. `meta.requestId` matches the `x-request-id` response header.

## Project layout

- `apps/api` — NestJS API, Prisma schema, and SQLite database
- `apps/web` — Vue application shell
- `packages/shared` — Zod schemas and the TypeScript types inferred from them

## Data model notes

Prisma ORM 7 requires a driver adapter, so the API connects through `@prisma/adapter-better-sqlite3`. The published `prisma` package tag currently points at an 8.0 pre-release, which is not used. This project pins Prisma 7.10.1.

SQLite stores JSON as text and Prisma cannot declare numeric range checks in `schema.prisma`. The initial migration adds `CHECK` constraints for versions, experiment limits, the pass threshold, run indexes, and evaluation scores. Application schemas also validate agent drafts, scoring criteria, and the 0–1 ranges.

Foreign keys use `ON DELETE RESTRICT` so experiments, runs, events, and evaluations are not removed with a parent record.

`expectedOutcome` and `scoringCriteria` are stored for later evaluation. They are not a runtime payload in this milestone, and nothing here sends them to an agent process.

## Out of scope

Hermes integration, configuration version publishing, experiment execution, evaluation, authentication, and deployment are intentionally absent.
