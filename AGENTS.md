# AGENTS.md — Conference Schedule Optimizer (Frontend)

Guidance for AI agents working in this repository. This is the Angular UI for the
**Conference Schedule Optimizer** backend (Timefold constraint solver + explainable planning; a
Spring AI/MCP layer is planned). The backend lives in the sibling repo
`../conference-schedule-optimizer`.

## Stack

- **Angular 21**, standalone components + **signals**. **Zoneless** change detection
  (`provideZonelessChangeDetection()` — there is **no** zone.js polyfill; never add
  `provideZoneChangeDetection`).
- **Angular Material** (`@angular/material` v21).
- **Reactive forms** (`ReactiveFormsModule`) for editing.
- **Generated, typed API client** (openapi-generator `typescript-angular`) under `src/app/api`.
- Test runner is **Vitest** (`ng test` via `@angular/build:unit-test`) — not Karma/Jasmine.
- Node **^20.19** (or ^22.12 / ^24).

## Golden rules

1. **The API client is generated — never hand-edit `src/app/api/**`.** It is generated from
   `openapi/api.yaml` (a copy of the backend's `src/main/resources/openapi/api.yaml`). To update:
   copy the backend spec into `openapi/api.yaml`, then run `npm run generate:api`. Import models and
   services from the barrel `'../api'`.
2. **Stay zoneless / signal-first.** Use signals + `computed()` for state and derivations. Do not
   introduce zone.js or `provideZoneChangeDetection`. Prefer signal-driven derivation over
   imperative `@ViewChild`/`AfterViewInit` wiring (e.g. table sort/filter is done with signals, not
   `MatTableDataSource` + `MatSort` view queries).
3. **Relative API paths + dev proxy.** `provideApi('')` sets an empty base path so requests hit
   `/v1/...` and the dev proxy (`proxy.conf.json`) forwards them to `http://localhost:8080`. Don't
   hardcode `http://localhost:8080` in code.
4. **Plan before implementing** and get approval before writing code (user's global workflow).

## Layout

```
src/app/
  api/                        GENERATED OpenAPI client (services *Api, models, provideApi, Configuration)
  presets/                    Preset CRUD component (inline-editing tables; sort/filter/reset)
  schedule/                   Planning-solution view (timetable + score + constraint explanations)
  shared/confirm-dialog/      Reusable MatDialog confirm component
  app.ts / app.html / app.scss  Shell: MatToolbar, nav, "Optimize now" button
  app.config.ts               Providers: router, http(+fetch), animations async, provideApi(''), zoneless
  app.routes.ts               '' → /schedule; lazy /schedule and /presets
openapi/api.yaml              Local copy of the backend contract (source for generate:api)
proxy.conf.json               /v1 → http://localhost:8080  (wired into angular.json serve options)
```

## Commands

```bash
npm install
npm start                 # ng serve + dev proxy → http://localhost:4200
npm run build             # production build
npm test                  # unit tests (Vitest)
npm run generate:api      # regenerate src/app/api from openapi/api.yaml
```

- `ng new` / `npm install` are slow and `ng new` can stall interactively — if scaffolding, use
  `CI=true`, `--skip-install`, `--defaults`, then `npm install` separately.
- After code changes, verify with `CI=true npx ng build` (catches template/type errors).

## Conventions

- **Standalone components** with an `imports:` array (no NgModules). Class names are PascalCase
  (`Presets`, `Schedule`, `App`); the shell selector is `app-root`.
- **Signals** for component state; `computed()` for derived views (e.g. `timeslotRows` =
  filter → sort → prepend draft-new row). Update signals immutably (`.set` / `.update`).
- **Reactive forms** for inline editing; bind table-cell inputs with
  `[formControl]="$any(form.get('field'))"` to avoid a wrapping `formGroup` per cell. Sentinel
  `NEW_ID = -1` marks the draft "add" row.
- **Material** modules imported per-component. Use `MatSnackBar` for feedback and the shared
  `ConfirmDialog` for destructive actions.
- **Styling:** component SCSS, sleek/compact. Keep component styles under the budget in
  `angular.json` (`anyComponentStyle` warning 8kB / error 16kB); bump the budget only if justified.
- New Angular control flow (`@if` / `@for` with `track`) — not `*ngIf` / `*ngFor`.

## Feature notes

- **Presets** (`/presets`): inline-edit CRUD for talk & timeslot presets over the `preset`-tagged
  API. Has per-column **sorting** (`MatSort` header + `Sort` signal), per-column **filtering**
  (text inputs; tri-state All/Yes/No selects for booleans), and a **reset** (clears filters + sort),
  all signal-driven.
- **Schedule** (`/schedule`): calls `getLatestPlanningSolution()` (handles 404/empty and error
  states). Renders a score banner (feasible + hard/soft), a room × time timetable, and per-talk
  **constraint-match explanations** (click a talk → why it was placed there) plus an overall
  constraint breakdown.
- **"Optimize now"** button (top-left of the toolbar in `app.html`) calls `POST /v1/planningsolution`
  (`startPlanningSolution()`), which returns 202 and runs asynchronously on the backend.

## Gotchas

- The generated client is emitted with `ngVersion=19.0.0` (the generator doesn't know 21) but relies
  on stable `HttpClient` APIs and compiles under Angular 21. Don't "fix" the generated version.
- `@angular/animations` **must** be installed (Material's `provideAnimationsAsync()` imports
  `@angular/animations/browser`); if a build fails with "Could not resolve @angular/animations/browser",
  run `npm install @angular/animations@^21`.
- When the backend API changes, **both** repos must be regenerated. Frontend: re-copy
  `openapi/api.yaml`, run `npm run generate:api`, then adjust components for new/renamed fields.
- Keep `provideApi('')` — switching to an absolute base path breaks the proxy and reintroduces CORS.
```
