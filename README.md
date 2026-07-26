# Conference Schedule Optimizer — Frontend

Angular 21 frontend for the **Conference Schedule Optimizer** backend (Timefold constraint
solver + Spring AI). It provides two views driven entirely by the backend's OpenAPI contract:

- **Presets** (`/presets`) — table-based CRUD editor for timeslot and talk presets
  (`preset`-tagged API operations), with inline row editing.
- **Schedule** (`/schedule`) — a styled view of the latest planning solution
  (`planningsolution`-tagged API operations): a room × time timetable, a score summary
  banner (feasible + hard/soft), and constraint-match explanations both solution-wide and
  per-talk (click a talk to see *why* it was placed there).

## Tech stack

- Angular 21 (standalone components + signals)
- Angular Material
- Generated typed API client (OpenAPI Generator, `typescript-angular`)
- Dev proxy for `/v1` → backend on `:8080`

## Prerequisites

- Node.js `^20.19` (or `^22.12` / `^24`)
- The backend running locally on `http://localhost:8080`
  (see the `conference-schedule-optimizer` repo).

## Getting started

```bash
npm install
npm start          # ng serve with the /v1 dev proxy -> http://localhost:4200
```

The dev proxy (`proxy.conf.json`) forwards all `/v1/*` requests to the backend, so no CORS
configuration is needed on the backend side.

## Regenerating the API client

The typed client under `src/app/api` is generated from the backend OpenAPI spec
(`openapi/api.yaml`, a copy of the backend's
`src/main/resources/openapi/api.yaml`). After the spec changes, refresh the copy and run:

```bash
npm run generate:api
```

## Build & test

```bash
npm run build      # production build
npm test           # unit tests (Vitest)
```

## Project layout

```
src/app/
  api/                     generated OpenAPI client (services + models)
  presets/                 preset CRUD component (inline-editing tables)
  schedule/                planning-solution timetable + constraint explanations
  shared/confirm-dialog/   reusable delete-confirmation dialog
  app.config.ts            providers (http + fetch, animations, provideApi(''))
  app.routes.ts            /schedule (default) and /presets lazy routes
```
