# OpenShell Console frontend

The web UI of the OpenShell Console: React 19, TypeScript (strict), Vite, Tailwind CSS v4 and
shadcn/ui (default theme, light and dark). The Rust backend in `../backend` serves the built
files from `dist/` and the JSON, SSE and WebSocket API under `/api`.

## Develop

    bun install
    bun run dev            # Vite on http://localhost:5173, proxies /api to the backend

The dev server proxies `/api` (including WebSockets) to `http://127.0.0.1:8787`. Set
`OPENSHELL_UI_BACKEND=http://127.0.0.1:8788` to use another backend. The backend accepts
writes and WebSocket upgrades only when `Origin` matches its own host, so the proxy rewrites
`Origin` to the backend URL (see `vite.config.ts`).

| Script              | What it does                                                  |
| ------------------- | ------------------------------------------------------------- |
| `bun run dev`       | Dev server with hot reload                                    |
| `bun run build`     | Type-check and build to `dist/`                               |
| `bun run test`      | Unit and component tests (Vitest, Testing Library, MSW)       |
| `bun run lint`      | ESLint and Prettier check                                     |
| `bun run format`    | Prettier write                                                |
| `bun run typecheck` | `tsc` only                                                    |
| `bun run gen:types` | Regenerate `src/gen` from `../backend/proto` (needs `protoc`) |

## Layout

    src/
      api/          the only code that talks to the backend
        client.ts     fetch wrapper: errors, CSRF token and one retry after a token change
        rpc.ts        typed map of the gateway methods the backend allowlists
        queries.ts    TanStack Query hooks and query keys (everything for a gateway under ['gw', name])
        mutations.ts  useRpc(): a write that toasts and refreshes that gateway's queries
        types.ts      shapes of the console's own endpoints (gateways, containers, audit, files)
      app/          providers, routes, query client, route error and 404 pages
      components/
        ui/           shadcn/ui components (generated; compose rather than edit)
        common/       shared building blocks: DataTable, FormDialog, ConfirmProvider,
                      KeyValueEditor, CodeEditor, StatusBadge, QueryView, WriteButton, …
        layout/       app shell: sidebar, gateway switcher, workspace select, refresh, theme
      features/     one folder per area: overview, sandboxes (detail tabs in detail/),
                    policy, logs, terminal, files, services, providers, profiles,
                    templates, workspaces, gateway
      gen/          TypeScript types generated from the protos (do not edit)
      hooks/        useScope (selected gateway and workspace), useCanWrite, useIsMobile
      lib/          pure logic with unit tests: policy rules and YAML, validation (zod),
                    formatting, paths, shell splitting, theme, persisted preferences
      test/         Vitest setup, MSW server with default handlers, renderApp helper

## Conventions

- **Server state only through `src/api`.** Pages call query hooks; writes go through
  `useRpc(gw, 'Method')`, which is typed from `rpc.ts`. Add a gateway method to `rpc.ts`
  only after the backend allowlists it.
- **Wire format.** Messages are protojson with proto field names (`snake_case`), int64 as
  strings and enums as their names; `src/gen` describes exactly that. Secret fields arrive as
  `"[redacted]"` (`REDACTED`) and must never be sent back.
- **Workspaces.** Names are unique per workspace, so a sandbox is addressed by
  `{ workspace, name }` (`SandboxRef`) and lives at `/sandboxes/:workspace/:name/:tab?`.
  Actions use the resource's own workspace, so they work in the "All workspaces" view.
- **Writes.** Use `WriteButton` (disabled with an explanation in read-only mode), confirm
  anything destructive with `useConfirm()` (`typeToConfirm` for deletes that cannot be
  undone), and show request errors inside the dialog (`toastErrors: false`).
- **Forms.** react-hook-form with zod schemas; dialogs mount their form on open so state
  starts fresh (`FormDialog` + `DialogForm`).
- **Tables.** `DataTable` with columns from `columnsFor<T>()`; keep column arrays stable
  (module scope or `useMemo`), or open menus close on every refresh.
- **No inline scripts.** The backend's CSP is `script-src 'self'`; the theme is applied before
  paint by `public/theme-init.js`. Fonts are self-hosted (`@fontsource`).

## Features

Everything the gateway API offers to an operator: sandboxes (create with network rules,
providers, resources, GPUs, labels, environment and services; start, stop, delete), the
policy (rules with per-endpoint and per-binary removal, YAML editing, settings), policy
proposals (preview as a diff, edit, approve, reject, undo, approve all, clear), policy
history with version diffs, live logs over SSE with filters, an xterm.js terminal, a file
browser (upload, preview, edit, mkdir, delete), services, providers (credentials, expiry,
refresh and rotation), provider profiles (import, lint, edit, delete), templates,
workspaces and members, gateway info, global settings, the gateway service log and the
console's audit log. A ⌘K / Ctrl+K command palette jumps to pages, sandboxes and terminals and
runs common actions. Sandbox phases refresh every 2 s while they change; everything else
follows the auto-refresh setting. Light and dark themes, per-page tab titles, and read-only
mode throughout.
