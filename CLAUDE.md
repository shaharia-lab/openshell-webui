# CLAUDE.md

Guidance for AI coding agents working in this repository.

## What this is

A local web UI for OpenShell gateways (upstream: https://github.com/NVIDIA/OpenShell).

- `backend/`: Rust (axum + tonic + prost-reflect). Reads the OpenShell CLI gateway registry
  (`~/.config/openshell/gateways/<name>/`), talks to gateways over gRPC with the CLI's
  credentials (mTLS, OIDC, plaintext), and serves a JSON / SSE / WebSocket API under `/api`.
  Release builds embed `frontend/dist` and serve it with SPA fallback.
- `frontend/`: React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui (default theme),
  TanStack Query, React Router. Types are generated from the protos.

See README.md, backend/README.md and frontend/README.md. Full docs live in `docs/`:
`docs/user-guide/` for people using the WebUI, `docs/developer-guide/` for contributors.

## Commands

    make dev            # backend (cargo watch) + frontend (Vite HMR) together
    make backend-dev    # backend only, on 127.0.0.1:8787 (ADDR=... to change)
    make frontend-dev   # Vite dev server, proxies /api to the backend
    make test           # cargo test + vitest
    make lint           # cargo fmt --check, clippy -D warnings, eslint, prettier, tsc
    make build          # bin/openshell-webui with the frontend embedded
    make proto          # refresh protos from $OPENSHELL_SRC and regenerate TS types

Run `make lint test` before finishing any change. When a change alters what users see or do,
or how the code is organized, update the matching page in `docs/` in the same change.

Releases: a `v*` tag matching `backend/Cargo.toml`'s version runs `.github/workflows/release.yml`
(static musl binaries for Linux amd64/arm64, macOS amd64/arm64, on a GitHub release) and
`docker.yml` (the GHCR image). Asset names carry no version, so README's
`releases/latest/download/...` URLs stay valid; keep them that way. The example image
`ghcr.io/<owner>/claude-sandbox` is separate: `claude-sandbox.yml` publishes it on every push
to `main` that touches `examples/claude-sandbox/`, not on tags.

## Layout and conventions

- `backend/proto/`: copied from upstream (`SOURCE_COMMIT`). Never edit; refresh with `make proto`.
- Gateway calls use reflection (`backend/src/gateway`, `reflect.rs`): a read route is one line
  in `http/reads.rs`; exposing a gateway method to the browser is one line in `rpcs.rs`.
  Don't add hand-written per-method wrappers.
- Domain logic lives outside `http/` (e.g. `exec.rs`, `sandbox_fs.rs`, `local/`) so it is
  testable without HTTP; handlers stay thin.
- Backend tests: unit tests next to the code, HTTP tests in `backend/tests/api.rs` against an
  in-process fake gateway (generated server with default stubs).
- Frontend: server state only through TanStack Query hooks in `src/api/`; shared UI in
  `src/components/common`; one folder per feature in `src/features/`. shadcn components in
  `src/components/ui` are generated; prefer composing them over editing them.
- Formatting: rustfmt (`backend/rustfmt.toml`), prettier + eslint in `frontend/`.

## Security invariants (must hold for every change)

- Every gateway message sent to the browser goes through `redact::redact` (use `ProtoJson`).
- The browser can only reach methods in `rpcs.rs`. Never allowlist sandbox-token,
  supervisor, peer or credential-export RPCs (`IssueSandboxToken`, `GetProviderCredentials`, ...).
- Every non-GET route and WebSocket upgrade passes the Origin + CSRF guard; writes respect
  `--read-only` and are recorded in the audit log without credentials or bodies.
- The server binds to loopback by default and rejects unknown `Host` headers.
- CSP is `script-src 'self'`: no inline scripts and no third-party CDNs or fonts in the frontend.
- Never commit real credentials, tokens, personal paths or machine-specific settings.
  Test fixtures use obviously fake values.
