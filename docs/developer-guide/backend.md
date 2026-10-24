# Backend

This page maps the Rust backend in `backend/`: its modules, its HTTP API, its error format, and how to extend and test it.

Stack: [axum](https://github.com/tokio-rs/axum) 0.8, [tonic](https://github.com/hyperium/tonic) 0.14 with prost, and [prost-reflect](https://github.com/andrewhickman/prost-reflect) 0.16. The crate forbids `unsafe` code (`[lints.rust]` in `backend/Cargo.toml`).

## Module map

| File or folder | Responsibility |
|---|---|
| `build.rs` | Compiles `proto/*.proto` into a client, a test server with default stubs, and a descriptor set |
| `src/main.rs` | Parses flags, binds, logs the mode and audit path, opens the browser with `--open` |
| `src/lib.rs` | `bind` builds `AppState`; `serve` runs axum until Ctrl+C or SIGTERM |
| `src/config.rs` | Command-line flags, each with an `OPENSHELL_UI_*` variable |
| `src/state.rs` | `AppState`, the Host allowlist, the random CSRF token |
| `src/error.rs` | `ApiError`, gRPC to HTTP status mapping |
| `src/proto.rs` | Generated types and the embedded descriptor `POOL` |
| `src/reflect.rs` | Method lookup, proto JSON in and out, filling `workspace_scope`, clearing `request_id` |
| `src/redact.rs` | Masks `(openshell.options.v1.secret)` fields; detects echoed masks |
| `src/rpcs.rs` | `ALLOWED`: the methods the browser may call, each `Read` or `Write` |
| `src/audit.rs` | Append-only JSON-lines audit log |
| `src/convert.rs` | CLI-style policy and provider-profile YAML or JSON to proto |
| `src/workspace.rs` | The `?workspace=` value and its `WorkspaceSelector` |
| `src/validate.rs` | Name regex, `since` durations, clamped integer query values |
| `src/exec.rs` | Non-interactive exec over `ExecSandboxInteractive` with chunked stdin |
| `src/sandbox_fs.rs` | Sandbox file operations on top of `exec` |
| `src/files.rs` | `tail` of a local file |
| `src/about.rs` | WebUI and CLI versions, cached latest-release check |
| `src/gateway/registry.rs` | Reads the CLI gateway registry |
| `src/gateway/client.rs` | Channel per gateway: mTLS, OIDC, plaintext; unary and server-streaming calls |
| `src/gateway/codec.rs` | `DynamicCodec` for `DynamicMessage` |
| `src/gateway/mod.rs` | `Gateways`: connection pool, `call`, `call_json`, `list_all` |
| `src/local/` | `docker.rs` container stats, `gateway_log.rs` local gateway log, `command.rs` CLI runner |
| `src/http/mod.rs` | Router, layers, security headers, CSP |
| `src/http/guard.rs` | Host, `Sec-Fetch-Site`, Origin and CSRF checks |
| `src/http/reads.rs` | Read routes and their factories |
| `src/http/calls.rs` | Session, about, the generic call endpoint, convert, audit |
| `src/http/watch.rs` | SSE watch |
| `src/http/terminal.rs` | WebSocket terminal |
| `src/http/files.rs` | File browser routes |
| `src/http/local.rs` | Local containers and gateway log routes |
| `src/http/proto_json.rs` | `ProtoJson`, the redacting response type |
| `src/http/assets.rs` | Embedded frontend and SPA fallback |

Keep domain logic outside `http/` so you can test it without HTTP. Handlers stay thin.

## API routes

Verified against the `routes()` functions merged in `backend/src/http/mod.rs`. Sandbox routes take `?workspace=` (`*` for all workspaces, empty for `default`).

| Method and path | Handler | Purpose |
|---|---|---|
| `GET /api/session` | `calls.rs` | CSRF token and read-only flag |
| `GET /api/about` | `calls.rs` | WebUI version, CLI version, update check |
| `GET /api/gateways` | `reads.rs` | Registered gateways |
| `GET /api/gw/{gw}/health` | `reads.rs` | `Health` |
| `GET /api/gw/{gw}/whoami` | `reads.rs` | `GetCurrentUser` |
| `GET /api/gw/{gw}/info` | `reads.rs` | `GetGatewayInfo` |
| `GET /api/gw/{gw}/workspaces` | `reads.rs` | `ListWorkspaces` (all pages) |
| `GET /api/gw/{gw}/{sandboxes,providers,profiles,services,templates}` | `reads.rs` | Paginated lists, workspace-scoped |
| `GET /api/gw/{gw}/sandboxes/{name}` | `reads.rs` | `GetSandbox` |
| `GET /api/gw/{gw}/sandboxes/{name}/policy` | `reads.rs` | `GetSandboxPolicyStatus` |
| `GET /api/gw/{gw}/sandboxes/{name}/effective-policy` | `reads.rs` | Policy fields of `GetSandboxConfig` |
| `GET /api/gw/{gw}/sandboxes/{name}/policy-history` | `reads.rs` | `ListSandboxPolicies` without bodies |
| `GET /api/gw/{gw}/sandboxes/{name}/logs` | `reads.rs` | `GetSandboxLogs`; `n`, `source`, `level`, `since` |
| `GET /api/gw/{gw}/sandboxes/{name}/watch` | `watch.rs` | SSE over `WatchSandbox` |
| `GET /api/gw/{gw}/sandboxes/{name}/exec` | `terminal.rs` | WebSocket terminal |
| `GET`, `DELETE /api/gw/{gw}/sandboxes/{name}/files?path=` | `files.rs` | List a directory, delete a path |
| `GET`, `PUT /api/gw/{gw}/sandboxes/{name}/files/content?path=` | `files.rs` | Download, upload (up to 64 MiB) |
| `POST /api/gw/{gw}/sandboxes/{name}/files/mkdir?path=` | `files.rs` | Create a directory |
| `POST /api/gw/{gw}/call/{method}` | `calls.rs` | An allowlisted method, proto JSON body. `?scope=platform` drops the workspace for provider profile methods |
| `POST /api/convert/policy`, `POST /api/convert/profile` | `calls.rs` | CLI YAML, proto YAML or proto JSON to proto JSON |
| `GET /api/audit?n=` | `calls.rs` | Last audit entries |
| `GET /api/local/containers` | `local.rs` | Docker containers and stats |
| `GET /api/local/gateway-log?n=` | `local.rs` | Local gateway log lines |

Anything else under `/api/` is a JSON 404 from `assets.rs`.

## Error format

Every handler returns `ApiResult<T>`. `ApiError` renders as:

```json
{"error": "not yours", "code": "PermissionDenied"}
```

- `code` is present only when the error came from the gateway (`error::code_name`).
- The HTTP status follows `error::http_status`: `InvalidArgument`, `FailedPrecondition` and `OutOfRange` map to 400, `NotFound` to 404, `AlreadyExists` and `Aborted` to 409, `PermissionDenied` to 403, `Unauthenticated` to 401, `Unavailable` to 503, `DeadlineExceeded` to 504, `Unimplemented` to 501, anything else to 502.
- Guard failures use 421 (unknown Host) and 403 (cross-site, Origin, CSRF). Read-only refusals are 403 with `the WebUI runs in read-only mode`.

## Configuration flags

Flags live in `backend/src/config.rs`: `--addr`, `--open`, `--read-only`, `--audit-log`, `--gateway-log-dir`, `--allowed-host`, `--timeout-secs`, `--no-update-check`. Writes use a timeout of at least 60 seconds (`WRITE_TIMEOUT` in `backend/src/lib.rs`). The [configuration reference](../user-guide/configuration.md) documents each flag for users.

When you add a flag, add an `env = "OPENSHELL_UI_..."` attribute, thread it through `Inner` in `state.rs`, and update the user guide and the README table.

## Add a read route

A read that maps to one gateway method is one line in `routes()` in `backend/src/http/reads.rs`:

| Factory | Use for | Request it builds |
|---|---|---|
| `unary(method)` | Methods without arguments | `{}` |
| `list(method, items_field, scoped)` | Paginated lists | `{workspace_scope}` when `scoped`, plus paging |
| `sandbox_get(method, name_field)` | Per-sandbox reads | `{<name_field>: name, workspace_scope}` |

Write a custom handler only when the response needs shaping, like `effective_policy`. Return `ProtoJson` so the response is redacted. See [Recipes](recipes.md#add-a-read-route).

## Expose a gateway method

Add one line to `ALLOWED` in `backend/src/rpcs.rs` as `Read` or `Write`. The generic `POST /api/gw/{gw}/call/{method}` endpoint handles parsing, redaction checks, workspace scope, request ID, read-only mode and auditing. Then add it to `RpcMap` in `frontend/src/api/rpc.ts`. See [Recipes](recipes.md#expose-a-new-gateway-method) and the [blocked RPCs](upstream-openshell.md#rpcs-that-stay-blocked).

The unit test `every_allowlisted_method_exists_and_is_unary` fails if you add a name that is not a unary gateway method.

## Tests

| Kind | Where | How |
|---|---|---|
| Unit | `#[cfg(test)] mod tests` next to the code | Pure functions: parsing, redaction, audit targets, path checks |
| HTTP integration | `backend/tests/api.rs` | The full router against an in-process fake gateway |

The fake gateway in `backend/tests/api.rs` implements the generated `OpenShell` trait. `build.rs` generates the server with default stubs, so unimplemented methods return `Unimplemented`. `harness(read_only)` starts the fake on a random port, writes a temporary registry entry named `fake`, and builds the router with a fixed CSRF token. See [Testing](testing.md#backend-integration-tests).

```bash
cd backend
cargo test                                   # all tests
cargo test --test api request_guards         # one integration test
cargo clippy --all-targets -- -D warnings
```

## Related

- [Architecture](architecture.md)
- [Recipes](recipes.md)
- [Testing](testing.md)
- [Security](security.md)
