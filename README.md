# Agent Evaluation Platform

Local application for defining agents and tasks, inspecting installed Hermes capabilities, publishing immutable agent configuration versions, executing experiments with Hermes, and evaluating completed runs. It does not install skills or change Hermes profiles.

## Prerequisites

- macOS
- Node.js 24.15 or newer (`nvm use` reads `.nvmrc`, currently 24.22.2)
- npm 11
- Hermes Agent 0.22.7 on `PATH`, or an absolute path in `HERMES_EXECUTABLE`

The discovery adapter parses Hermes 0.22.7 output only. Another version returns `UNSUPPORTED_VERSION` and an empty catalogue with an explicit discovery error. It does not guess a catalogue.

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

| Command                                     | Purpose                                                                                 |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| `npm install`                               | Install workspace dependencies and generate the Prisma client                           |
| `npm run dev`                               | Start the API and web app together                                                      |
| `npm run db:migrate`                        | Create and apply a development migration                                                |
| `npm run db:deploy`                         | Apply committed migrations                                                              |
| `npm run db:generate`                       | Generate the Prisma client                                                              |
| `npm run db:validate`                       | Validate `schema.prisma`                                                                |
| `npm test`                                  | Run the API test suite against a temporary SQLite database                              |
| `HERMES_LIVE_CHECK=1 npm test -w @eval/api` | Optional read-only check against the local Hermes install. Default `npm test` skips it. |
| `npm run typecheck`                         | Type-check shared, API, and web packages                                                |
| `npm run lint`                              | Lint the workspace                                                                      |
| `npm run format`                            | Format the workspace with Prettier                                                      |
| `npm run check`                             | Run format, lint, Prisma validate, typecheck, and tests                                 |

## API

All routes are under `/api/v1`.

- `GET /health`
- `GET /agents`, `POST /agents`, `GET /agents/:id`, `PUT /agents/:id`, `PUT /agents/:id/configuration`
- `POST /agents/:id/configuration/validate`
- `POST /agents/:id/configuration-versions`
- `GET /agents/:id/configuration-versions`
- `GET /configuration-versions/:versionId`
- `GET /runtime/profiles`
- `GET /runtime/capabilities?profile=`, `GET /runtime/models?profile=`, `GET /runtime/skills?profile=`, `GET /runtime/toolsets?profile=`
- `GET /tasks`, `POST /tasks`, `GET /tasks/:id`, `PUT /tasks/:id`
- `GET /agents/:agentId/task-suites`, `POST /agents/:agentId/task-suites`, `GET /agents/:agentId/task-suites/:suiteId`, `PUT /agents/:agentId/task-suites/:suiteId`, `PUT /agents/:agentId/task-suites/:suiteId/tasks`, `DELETE /agents/:agentId/task-suites/:suiteId`
- `GET /experiments`, `POST /experiments`, `GET /experiments/:id`, `PUT /experiments/:id`
- `POST /experiments/:id/start`, `GET /experiments/:id/execution`, `GET /experiments/:id/runs`, `GET /runs/:id`
- `POST /experiments/:id/evaluate`, `GET /experiments/:id/evaluation`, `GET /experiments/:id/comparison`, `GET /runs/:id/evaluation`

List routes accept `page` and `pageSize`. `pageSize` cannot exceed 100. Runtime routes accept `refresh=true` to bypass the 30 second in-memory cache. A failed refresh replaces a cached success. Discovery failures include `discoveryErrors` and are not returned as a successful empty catalogue.

`profile` is required for capabilities, models, skills, and toolsets. The profile id must match `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$`. Skills, toolsets, and the configured model are read with `hermes -p <profile>` after that profile has been found. The default profile's skills and toolset flags are never copied onto another profile.

The draft field `profileId` is the profile used for validation and publishing. It is stored in the snapshot and included in the configuration hash. Changing it in the editor does not affect validation until the draft is saved. New drafts and new publishes require an explicit profile id.

Rows written before `profileId` existed need no SQL migration. Startup does not scan or rewrite them, and a missing profile id is not filled with `default` or the active Hermes profile. A stored draft without `profileId` can still be read. Validation returns HTTP 200 with `valid: false` and a blocking `profileId` issue. Publishing returns HTTP 400 and does not create a version. The draft gains a profile only when a client saves one explicitly. A published snapshot without `profileId` is returned with that field absent and with its original hash. `AgentConfiguration` rows are not updated to add a profile.

A model that the selected profile does not configure is a blocking `UNSUPPORTED_CAPABILITY` error on `model`. A model that the profile does configure, with `availability: "unknown"`, is an `UNVERIFIED_BEHAVIOR` warning and can be published. `availability: "unavailable"` is a blocking error. The editor labels these as “not configured for this profile”, “usability not verified”, and “unavailable”.

`PUT /agents/:id/configuration` replaces the agent draft. It does not call Hermes and does not publish a version.

`POST /agents/:id/configuration/validate` checks the stored draft against `draft.profileId`. It returns HTTP 200 with `{ valid, errors, warnings }` and does not write. A rejected publish returns HTTP 400, and each detail keeps the validation issue `code`.

`POST /agents/:id/configuration-versions` publishes the stored draft when validation has no blocking errors. HTTP 200 is used both when a new version is stored and when the same canonical configuration is reused. The response includes `reused`. Historical versions are not updated or deleted. The snapshot hash is SHA-256 of canonical JSON: object keys are sorted by UTF-16 code units, array order is preserved, and ids, timestamps, and warnings are excluded. Concurrent publishes of the same hash rely on the unique `(agentId, configHash)` constraint and retry on Prisma `P2002`.

Warnings use `UNVERIFIED_BEHAVIOR`. Blocking errors use `UNSUPPORTED_CAPABILITY` or `DISCOVERY_FAILED`. Publish stores warnings on the version. `publishWarnings` is an optional SQLite JSON column, generated by Prisma as `JSONB` without a PostgreSQL cast or a default. Existing rows stay null, and the API treats null as `[]`.

The web app lists agents with profile, provider, model, published version count, and updated time. An agent page has Overview, Configuration, and Configuration history tabs. Save draft, validate, and publish are separate. Validate and publish stay disabled until the draft is saved, because they read the stored draft and its `profileId`. Skills and toolsets come from that profile. A row can be unchecked when it is already selected. It cannot be newly selected when `configurable` is false, and a saved selection that is not configurable blocks publishing. Provider and model choices come from that profile's runtime catalogue. A configured model is marked availability `unknown` until a model call proves it. History is read-only.

Task requests do not include `version`. The API stores version 1 on create. It increments that version only when `input`, `expectedOutcome`, `scoringCriteria`, or `outputSchema` changes. Renaming a task, editing its description, or changing tags leaves the version unchanged. `outputSchema` is optional JSON. An empty value stores no schema.

A task suite belongs to one agent. A task belongs to at most one suite. Deleting a suite sets `taskSuiteId` to null and leaves the task in place. An experiment belongs to one agent and stores the selected published configuration ids, the selected suite ids, and one `ExperimentTask` snapshot per unique task. Later task edits do not change an existing snapshot. Planned execution count is the number of selected configurations multiplied by the number of unique tasks. `repetitions`, `concurrency`, `timeoutSeconds`, and `passThreshold` are stored as 1, 1, 1, and 1 so the existing columns remain valid. They are not part of the request or the UI. `timeoutSeconds` is not the Hermes process timeout.

`POST /experiments/:id/start` accepts only a `DRAFT` experiment. It marks the experiment `RUNNING` and returns without waiting for Hermes. One `Run` is created for each selected published configuration and unique task snapshot, in configuration display order and task execution order, with `repetitionIndex` 0. Runs execute one at a time in the API process. A run is stored before its process starts. The experiment becomes `COMPLETED` after every planned run reaches a terminal state, including when some runs fail. A running or completed experiment cannot be started again. There is no resume after the API process stops. After the runs finish, completed runs are evaluated from their task snapshots.

Each run uses the published snapshot, not the current agent draft or the current task. The process is `hermes -p <profileId> -m <model> --provider <provider> -z <task input> --usage-file <temp>`, plus `--reasoning <level>` when the snapshot has a reasoning level. A non-empty `systemPrompt` is passed only as `HERMES_EPHEMERAL_SYSTEM_PROMPT` on that process. Profile files are not modified. A snapshot with no profile id, a reasoning level outside the verified Hermes list, selected skills or toolsets, or `memory.enabled` is rejected before any process starts. An empty system prompt does not override the profile's own prompt. The working directory is the system temp directory. The process timeout is 180 seconds. On timeout the process is terminated and the run is `TIMED_OUT`. A run is `COMPLETED` only when the exit code is 0 and the usage report has `completed: true`. Stdout is stored as final output and is not itself success. The usage row keeps the report's model, token, session, and completion fields. The temporary usage file is deleted. Expected outcome and scoring criteria are not sent to Hermes. When the task snapshot has an `outputSchema`, the task prompt also includes instructions to return one JSON object and the saved schema. The original task input stays in that prompt. The published system prompt is unchanged. A prompt does not make the response valid JSON. The API extracts the first JSON object from the raw output, including Markdown fences and surrounding text, and checks it with Ajv. The raw Hermes output stays on the run. Extraction or schema failure does not fail the execution and does not store a score. JSON field checks then use the extracted object. Tasks without a schema keep the previous prompt and evaluation behavior.

When execution finishes, completed runs with a final output are evaluated from `ExperimentTask.taskSnapshot`. `POST /experiments/:id/evaluate` evaluates completed runs that do not yet have an evaluation. `{ "reevaluate": true }` updates the existing row in place. A run has at most one evaluation. The score is the weight of passed applicable criteria divided by the weight of applicable criteria whose weight is greater than zero. Criteria with weight 0 still count when `required` is true. A run passes when the score is at least the stored `passThreshold` and every required applicable criterion passed. `passThreshold` remains the stored experiment value and is not shown as an editor control. Omitted `caseSensitive` is case-sensitive. `exact_match`, `output_contains`, `output_not_contains`, `json_field_equals`, and `numeric_comparison` are evaluated from the final output. `json_schema_valid` and the tool criteria are stored on the result as not applicable. A run does not store a tool trace. Ajv checks the task `outputSchema` before scoring; it is not used as a scoring criterion. They are excluded from the score. A run whose criteria cannot produce a score is counted as not evaluable and does not get an evaluation row. Failed, timed-out, and cancelled runs are not evaluated. Average score is the mean of stored scores. Pass rate is passed evaluations divided by evaluated runs. Comparison scores are for the same task only. A missing score is `N/A`.

Successful responses use `{ success, data, meta }`. Errors use `{ success: false, error: { code, message, details }, meta }`. `meta.requestId` matches the `x-request-id` response header.

## Project layout

- `apps/api` — NestJS API, Prisma schema, and SQLite database
- `apps/web` — Vue application shell
- `packages/shared` — Zod schemas and the TypeScript types inferred from them

## Hermes discovery

Discovery reaches Hermes only through the read-only process adapter. It spawns the executable with `shell: false` and an argument array. The allowed discovery commands are `--version`, `profile`, `profile list`, and profile-scoped `skills list`, `tools list`, and `config get model --json`. Enable, disable, install, and config writes are rejected before spawn. Experiment execution uses a separate spawn path and does not add prompts to the discovery allowlist.

`hermes skills list` truncates skill names when stdout is a normal pipe and `TERM=dumb`, even with a wide `COLUMNS` value. A pipe with `COLUMNS=500` and `TERM=xterm-256color` keeps the verified names, and the adapter strips ANSI and other terminal controls before parsing. A skill name that still contains an ellipsis fails discovery with `UNSUPPORTED_OUTPUT` instead of becoming a partial id. A pseudo-terminal was not required.

Discovery errors are structured: `capability`, `code`, `message`, and sometimes `exitCode`. Stdout is parsed only after exit 0. Stderr is discarded and is not logged or returned. Logs contain the structured diagnostic fields only.

On Hermes 0.22.7, the verified limits are:

- Skills and toolsets are listed, not changed. `configurable` is false. `--skills` and `-t` were not verified as exclusive selections, and the enable/disable commands would write the profile.
- Skill `source` (`builtin`, `hub`, or `local`) is the origin reported inside the selected profile. `enabled` is that profile's status. There is no profile-independent global skill command, so a skill missing from a profile is not reported as installed for that profile. `eval-base` lists `hermes-agent` only. `default` lists a larger set, including `apple-notes`.
- Toolset ids match across those two profiles, but enabled flags do not. `memory` is disabled on `default` and enabled on `eval-base`.
- Models are the profile's configured provider and model from `config get model --json`. `availability` is `unknown` because no model call is made. `base_url` is not returned. Unknown provider or model pairs are blocking errors.
- `profile show` can report a skill count that does not match `skills list`. The adapter uses the skill list and does not call `profile show`.
- CLI reasoning levels `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, and `ultra` may be stored. Known levels produce `UNVERIFIED_BEHAVIOR` because per-model support was not verified. Other strings are `UNSUPPORTED_CAPABILITY`. The UI shows a reasoning selector only when the runtime reports `reasoningOptions`, which this Hermes version does not.
- `memory.enabled` is stored on the draft and always produces a non-blocking warning. The UI does not offer a memory control.

`HERMES_LIVE_CHECK=1` runs one read-only test against the local install. It checks the profile split above and that the Hermes config files keep the same SHA-256. It does not print process output.

## Data model notes

Prisma ORM 7 requires a driver adapter, so the API connects through `@prisma/adapter-better-sqlite3`. The published `prisma` package tag currently points at an 8.0 pre-release, which is not used. This project pins Prisma 7.10.1.

From `apps/api`, `npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code --script` reports an empty migration when the committed SQLite migrations match the schema. Prisma's SQLite connector names JSON columns `JSONB` in that SQL. That name is not a PostgreSQL migration.

SQLite stores JSON as text and Prisma cannot declare numeric range checks in `schema.prisma`. The initial migration adds `CHECK` constraints for versions, experiment limits, the pass threshold, run indexes, and evaluation scores. Application schemas also validate agent drafts, scoring criteria, and the 0–1 ranges.

Foreign keys use `ON DELETE RESTRICT` so experiments, runs, events, and evaluations are not removed with a parent record.

`expectedOutcome` and `scoringCriteria` are stored on the task and copied into the experiment task snapshot. Evaluation reads the snapshot. Execution sends the task snapshot input only.

## Out of scope

LLM-as-judge, statistical significance, skill or tool installation, Hermes profile mutation, authentication, and deployment are intentionally absent.
