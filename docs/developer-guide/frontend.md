# Frontend

This page covers the React app in `frontend/`: its stack, layout, conventions, and how to test it.

## Stack

| Concern | Library |
|---|---|
| UI | React 19, TypeScript (strict), Vite |
| Styling | Tailwind CSS v4, shadcn/ui (default theme, light and dark), lucide icons |
| Server state | TanStack Query |
| Routing | React Router (`createBrowserRouter`, lazy pages) |
| Forms | react-hook-form with zod (`@hookform/resolvers`) |
| Tables | TanStack Table through `DataTable` |
| Client state | zustand (`src/lib/preferences.ts`) |
| Editors and terminal | CodeMirror (`@uiw/react-codemirror`), xterm.js |
| Tests | Vitest, Testing Library, MSW, jsdom |

Scripts are in `frontend/package.json`: `dev`, `build`, `test`, `test:watch`, `lint`, `format`, `typecheck`, `gen:types`.

## Layout

```text
src/
  api/          the only code that talks to the backend
    client.ts     fetch wrapper: errors, CSRF token, one retry after a token change
    rpc.ts        RpcMap: request and response types of allowlisted methods
    queries.ts    query hooks and keys (everything for a gateway under ['gw', name])
    mutations.ts  useRpc(): a write that toasts and refreshes the gateway's queries
    types.ts      shapes of the WebUI's own endpoints
  app/          providers, routes, query client, route error and 404 pages
  components/
    ui/           shadcn/ui (generated; compose rather than edit)
    common/       DataTable, FormDialog, ConfirmProvider, WriteButton, QueryView, ...
    layout/       sidebar, NAV, command palette, gateway switcher, workspace select
  features/     one folder per area: overview, sandboxes, policy, logs, terminal,
                files, services, providers, profiles, templates, workspaces, gateway
  gen/          types generated from the protos (do not edit)
  hooks/        useScope, useCanWrite (in use-scope.ts), useIsMobile, useDocumentTitle
  lib/          pure logic with unit tests: policy, validation, format, path, shell
  test/         Vitest setup, MSW server, renderApp
```

Import from `src` with the `@/` alias (`vite.config.ts`).

## Conventions

- **Server state only through `src/api`.** Pages call query hooks; writes go through `useRpc(gw, 'Method')`.
- **Scope.** `useScope()` returns the selected gateway (`gw`) and workspace (`ws`). `ws` is `*` (`ALL_WORKSPACES`) in the "All workspaces" view.
- **Resource addressing.** A sandbox is `{ workspace, name }` and lives at `/sandboxes/:workspace/:name/:tab?`. Actions use the resource's own workspace so they work in the "All workspaces" view.
- **Wire format.** Proto JSON with `snake_case` field names, int64 as strings and enums as names. Secret fields arrive as `[redacted]` and must never be sent back.
- **Errors in dialogs.** Pass `toastErrors: false` to `useRpc` and show `mutation.error` inside the dialog.
- **Stable columns.** Keep `DataTable` column arrays at module scope or in `useMemo`, or open menus close on every refresh.

## Data fetching

| Hook | Use |
|---|---|
| `useGwGet<T>(gw, path, params)` | A backend read route under `/api/gw/{gw}/` |
| `useGwCall(gw, method, ws, body)` | An allowlisted read method as a query |
| Named hooks (`useSandboxes`, `useTemplates`, ...) | Wrappers around the two above |
| `useRpc(gw, method, opts)` | A write; on settle it invalidates `['gw', gw]` and `['audit']` |

Queries refetch on the interval the user picks in the header. `useSandboxes` and `useSandbox` poll every 2 seconds while a sandbox changes phase. The query client does not retry 4xx errors (`src/app/query-client.ts`).

## Routing and navigation

- Routes live in `src/app/routes.tsx`. Each page is lazy: `page(() => import('@/features/...'))`, and the module's default export is the page.
- Page errors render inside the shell through `RouteError`, so the sidebar keeps working.
- `NAV` in `src/components/layout/nav.ts` drives both the sidebar (`app-sidebar.tsx`) and the "Pages" group of the command palette (`command-palette.tsx`). One entry adds both.
- Set the tab title with `useDocumentTitle('...')`.

## Forms

Use `FormDialog` and `DialogForm` from `src/components/common/form-dialog.tsx`:

- `FormDialog` is the dialog shell. Put the form in a child component so it mounts on open and its state starts fresh.
- `DialogForm` renders the scrolling body, the inline error alert, Cancel and the submit button with a spinner.
- Use `FormField` (`form-field.tsx`) with a `render` prop for each input; it wires label, description and the zod error.
- Shared zod schemas live in `src/lib/validation.ts` (`nameSchema`, `cpuSchema`, `memorySchema`, `envRowsSchema`, ...).

Build the request in a pure function when it has rules worth testing, as `src/features/sandboxes/create/request.ts` does. See [Recipes](recipes.md#add-a-form-dialog).

## Tables

Use `DataTable` (`src/components/common/data-table.tsx`) with columns from `columnsFor<T>()` (`columns.ts`). The table supports client-side sorting and text filtering (`filter` prop). Hide low-priority columns on small screens with `meta: { className: 'hidden md:table-cell' }`.

## Writes and read-only mode

- Use `WriteButton` (`src/components/common/write-button.tsx`) for any action that changes state. In read-only mode it is disabled with a tooltip. `disabledReason` covers other cases.
- `useCanWrite()` gives the same flag for menus and other controls.
- Confirm destructive actions with `useConfirm()` from `confirm-context.ts`. Set `destructive: true`, and `typeToConfirm: name` for deletes that cannot be undone. If `onConfirm` throws, the dialog stays open and shows the error.

## Theme and CSP constraints

The backend sends `script-src 'self'` (`backend/src/http/mod.rs`). This means:

- No inline scripts. The theme is applied before first paint by `public/theme-init.js`, loaded with `<script src>` from `index.html`.
- No third-party CDNs or font services. Fonts are bundled through `@fontsource-variable/geist`.
- `style-src` allows `'unsafe-inline'`, so inline styles from libraries work. `img-src` and `font-src` allow `data:`.

## Generated types

`src/gen/` holds TypeScript types generated from `backend/proto/` by `scripts/gen-proto-types.sh`:

- It runs `protoc` with `ts-proto` and `onlyTypes=true`, `useJsonWireFormat=true`, `snakeToCamel=false`, `forceLong=string`, `stringEnums=true`, so the types match the proto JSON the backend sends.
- Regenerate with `bun run gen:types` (needs `protoc`) or `make proto`. The output is committed; never edit it by hand.
- `RpcMap` in `src/api/rpc.ts` uses `Req<T>`, which omits `workspace_scope` and `request_id`: the backend fills the first and drops the second.

## Testing

- Pure logic: `*.test.ts` in a `__tests__` folder next to the code (`src/lib/__tests__/`, `src/features/*/__tests__/`).
- Components and pages: render with `renderApp` from `src/test/render.tsx`, which mounts the app providers, a memory router and the test gateway `test-gw`.
- HTTP: MSW intercepts `fetch`. `src/test/server.ts` has `defaultHandlers` for the session, gateways, about and empty lists; add per-test handlers with `server.use(...)`. `setSession({ read_only: true })` switches to read-only mode.
- Unhandled requests fail the test (`onUnhandledFrame: 'error'` in `src/test/setup.ts`).

See [Testing](testing.md#frontend-tests).

## Related

- [Architecture](architecture.md#frontend-data-flow)
- [Recipes](recipes.md)
- [Testing](testing.md)
