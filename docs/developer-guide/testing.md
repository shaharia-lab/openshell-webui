# Testing

This page covers the test and lint commands, how to write backend and frontend tests, what CI runs, and how to check a change against a real gateway.

## Commands

```bash
make test      # backend and frontend tests
make lint      # formatting, clippy, eslint, prettier, tsc
make fmt       # rustfmt and prettier --write
```

Run `make lint test` before you finish any change.

| Target | Runs |
|---|---|
| `make test` | `cargo test --locked` in `backend/`, then `bun run test` (`vitest run`) in `frontend/` |
| `make lint` | `cargo fmt --check` and `cargo clippy --all-targets --locked -- -D warnings` in `backend/`, then `bun run lint` (`eslint .` and `prettier --check .`) and `bun run typecheck` (`tsc -b --noEmit`) in `frontend/` |
| `make fmt` | `cargo fmt`, then `bun run format` (`prettier --write .`) |

Faster loops while you work:

```bash
cd backend && cargo test redact                 # tests whose name matches
cd backend && cargo test --test api             # only the HTTP tests
cd frontend && bun run test:watch               # Vitest in watch mode
cd frontend && bunx vitest run src/lib          # one folder
```

## Backend unit tests

Put unit tests in a `#[cfg(test)] mod tests` block at the end of the file they test. Existing examples:

- `backend/src/redact.rs`: secret fields are found from the descriptor pool; masks are applied and detected.
- `backend/src/rpcs.rs`: every allowlisted method exists and is unary; sensitive methods are absent.
- `backend/src/audit.rs`: targets keep identifiers and drop bodies.
- `backend/src/gateway/registry.rs`: registry parsing with a `tempfile` directory.

Use `reflect::from_json(&reflect::method("Name").unwrap().input(), json!({...}))` to build a request message in a test.

## Backend integration tests

`backend/tests/api.rs` drives the real router against a fake gateway in the same process.

- `FakeGateway` implements the generated `OpenShell` trait. `build.rs` generates the server with default stubs, so you implement only the methods your test needs; the rest return `Unimplemented`.
- The fake records what it receives (`deletes`, `files`, `stdin_chunks`) so tests can assert on the request the gateway got.
- `harness(read_only)` starts the fake on `127.0.0.1:0`, writes `gateways/fake/metadata.json` into a temporary registry, and builds `AppState` with the CSRF token `test-csrf-token` and host `127.0.0.1:8787`.
- `get(path)` and `post(path, body)` build requests with the right `Host`, `Origin` and `X-CSRF-Token`. `send` returns the status and JSON body.

To test a new gateway method:

1. Implement it on `FakeGateway`, with fake data such as `sk-not-a-real-key`.
2. Write a `#[tokio::test]` that calls the route through `send(&h.app, ...)`.
3. Assert the HTTP status, the JSON body, and, for writes, `h.audit.tail(n)`.

```rust
#[tokio::test]
async fn deletes_are_audited() {
    let h = harness(false).await;
    let (status, _) = send(&h.app, post("/api/gw/fake/call/DeleteSandbox", json!({"name": "sb"}))).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(h.audit.tail(1)[0]["method"], "DeleteSandbox");
}
```

## Frontend tests

Vitest runs with jsdom and `src/test/setup.ts` (`frontend/vitest.config.ts`).

| Kind | Where | Tools |
|---|---|---|
| Pure logic | `src/lib/__tests__/`, `src/features/*/__tests__/*.test.ts` | Vitest only |
| Hooks and API client | `src/api/__tests__/` | Vitest, MSW |
| Components and pages | `src/components/**/__tests__/`, `src/features/*/__tests__/*.test.tsx` | Testing Library, `user-event`, MSW, `renderApp` |

### MSW handlers

`src/test/server.ts` sets up an MSW server with `defaultHandlers`: `/api/session`, `/api/gateways` (one gateway, `test-gw`), `/api/about`, health, whoami, workspaces and empty lists. `setup.ts` resets handlers, the session and `localStorage` after each test, and fails on unhandled requests.

Add handlers per test:

```tsx
server.use(
  http.get('/api/gw/:gw/templates', () =>
    HttpResponse.json({ templates: [{ metadata: { name: 'python-dev' } }] }),
  ),
)
```

Capture a write to assert its body:

```tsx
let body: unknown
server.use(
  http.post('/api/gw/:gw/call/CreateSandbox', async ({ request }) => {
    body = await request.json()
    return HttpResponse.json({})
  }),
)
```

Use `setSession({ read_only: true })` before rendering to test read-only mode.

### `renderApp`

`renderApp(ui, { route, path, routes })` in `src/test/render.tsx` selects the test gateway and the `default` workspace, turns off auto-refresh and retries, and wraps `ui` in the app providers and a memory router. It returns the router, so you can assert navigation with `router.state.location`.

`src/features/sandboxes/__tests__/sandboxes-page.test.tsx` is a complete example.

## CI

`.github/workflows/ci.yml` runs on pushes to `main` and on pull requests:

| Job | Steps |
|---|---|
| Backend (Rust) | `cargo fmt --check`, `cargo clippy --all-targets --locked -- -D warnings`, `cargo test --locked` |
| Frontend (React) | `bun install --frozen-lockfile`, `bun run lint`, `bun run typecheck`, `bun run test`, `bun run build` |
| Release binary | After both pass: `make build`, uploads `bin/openshell-webui` as an artifact |

Other workflows build on pull requests only when their files change. See [Releasing](releasing.md).

## Manual verification against a real gateway

Automated tests use a fake gateway, so check user-visible changes against a real one:

1. Start read-only: `make dev ARGS=--read-only`. Open `http://localhost:5173`.
2. Walk the pages you changed. Check that write buttons are disabled with a tooltip.
3. Open the browser's network tab. Confirm responses show `[redacted]` for secrets and that no request goes to a third-party origin.
4. Restart read-write (`make dev`) on a gateway or workspace you can change safely.
5. Run the write. Compare the result with the equivalent `openshell` CLI command.
6. Check the Gateway page's audit log for the entry, and confirm it holds no bodies or secrets.
7. Try an invalid input and confirm the gateway's error shows in the dialog.

## Related

- [Backend](backend.md#tests)
- [Frontend](frontend.md#testing)
- [Local development](local-development.md)
- [Releasing](releasing.md)
