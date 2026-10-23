# Backend

The Rust server behind OpenShell WebUI. It reads the gateways registered in the
OpenShell CLI, talks to them over gRPC with the CLI's credentials, and serves a small
JSON / SSE / WebSocket API plus (in release builds) the embedded frontend.

Stack: [axum](https://github.com/tokio-rs/axum), [tonic](https://github.com/hyperium/tonic) +
[prost](https://github.com/tokio-rs/prost), and [prost-reflect](https://github.com/andrewhickman/prost-reflect),
the same versions upstream OpenShell uses.

## Commands

```bash
make backend-dev                      # from the repo root: run with hot reload on :8787
cargo run -- --addr 127.0.0.1:8788    # run once
cargo test                            # unit + integration tests (fake in-process gateway)
cargo clippy --all-targets -- -D warnings
cargo fmt
```

`cargo run -- --help` lists every flag; each one can also be set through an
`OPENSHELL_UI_*` environment variable.

## How it is built

| Module | Responsibility |
|---|---|
| `build.rs`, `proto.rs` | Generate the gateway client from `proto/` (copied from upstream, see `proto/SOURCE_COMMIT`) and embed a descriptor pool |
| `gateway/` | CLI registry reader, connection pool, mTLS / OIDC / plaintext transport, and a **dynamic gRPC codec** that calls any unary method from its descriptor |
| `reflect.rs` | Proto JSON in and out, method lookup, filling `workspace_scope` and `request_id` |
| `redact.rs` | Masks every field marked `(openshell.options.v1.secret)`; refuses requests that echo the mask back |
| `rpcs.rs` | The allowlist of methods the browser may call, each marked read or write |
| `convert.rs` | CLI-style policy and provider-profile YAML/JSON to proto |
| `audit.rs` | Append-only JSON-lines log of every write |
| `exec.rs`, `sandbox_fs.rs` | Non-interactive exec with chunked stdin, and the sandbox file browser on top of it |
| `local/` | Local gateway logs (Homebrew files or systemd journal) and Docker container stats |
| `http/` | Routes, request guards, SSE watch, WebSocket terminal, embedded assets |

Gateway calls go through reflection instead of hand-written wrappers. A read route is
one line in `http/reads.rs`, and exposing another gateway method to the UI is one line
in `rpcs.rs`. Only the bidirectional terminal stream uses the generated client.

## API

| Route | Purpose |
|---|---|
| `GET /api/session` | CSRF token and read-only flag |
| `GET /api/gateways` | registered gateways |
| `GET /api/gw/{gw}/{health,whoami,info,workspaces,sandboxes,providers,profiles,services,templates}` | reads, `?workspace=` (`*` = all) |
| `GET /api/gw/{gw}/sandboxes/{name}[/policy,/effective-policy,/policy-history,/logs]` | sandbox reads |
| `GET /api/gw/{gw}/sandboxes/{name}/watch` | Server-Sent Events: status, logs and platform events |
| `GET /api/gw/{gw}/sandboxes/{name}/exec` | WebSocket terminal |
| `GET,DELETE /api/gw/{gw}/sandboxes/{name}/files`, `GET,PUT …/files/content`, `POST …/files/mkdir` | file browser |
| `POST /api/gw/{gw}/call/{Method}` | allowlisted gateway method, proto JSON body |
| `POST /api/convert/{policy,profile}` | CLI YAML to proto JSON |
| `GET /api/audit`, `GET /api/local/{containers,gateway-log}` | audit log, local data |

Responses are proto JSON with proto field names. Errors are
`{"error": "...", "code": "<gRPC code>"}` with a matching HTTP status.

## Security

- Binds to `127.0.0.1` and rejects unknown `Host` headers (DNS rebinding).
- API requests from other sites are refused (`Sec-Fetch-Site`).
- Every non-GET request and WebSocket upgrade needs the same `Origin` and the per-start CSRF token.
- Only allowlisted methods are reachable; secret fields never leave the server.
- Read-only mode refuses every write, including the terminal and file uploads.
- Writes are audited without credentials or request bodies.
- `unsafe` code is forbidden in the crate.
