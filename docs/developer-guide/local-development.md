# Local development

This page shows you how to set up a machine, run the backend and frontend with hot reload, and point them at a gateway.

## Prerequisites

| Tool | Why | Check |
|---|---|---|
| Rust (stable, 1.88 or newer) | Builds the backend (`rust-version` in `backend/Cargo.toml`) | `cargo --version` |
| `cargo-watch` | Restarts the backend on change in `make backend-dev` | `cargo watch --version` |
| Bun | Installs and runs the frontend | `bun --version` |
| OpenShell CLI with a registered gateway | The WebUI reads the CLI's gateway registry and credentials | `openshell status` |
| Docker (optional) | Live container stats on the Overview page | `docker --version` |
| `protoc` (optional) | Only for `bun run gen:types` and `make proto` | `protoc --version` |

You do not need `protoc` to build the backend. `backend/build.rs` uses the vendored compiler from `protoc-bin-vendored`.

Install `cargo-watch` with `cargo install cargo-watch`.

### Get a local gateway

Follow the upstream [installation guide](https://github.com/NVIDIA/OpenShell/blob/main/docs/about/installation.mdx). In short:

- The install script (`install.sh` in the upstream repo) installs the CLI and a local gateway that listens on port `17670` on loopback.
- On macOS the gateway runs as a Homebrew service (`brew services restart openshell`).
- On Linux it runs as the systemd user unit `openshell-gateway` (`systemctl --user status openshell-gateway`).
- Check it with `openshell status`. It must say `Connected`.

The CLI stores each gateway in `~/.config/openshell/gateways/<name>/` (or under `$XDG_CONFIG_HOME`). The WebUI reads the same directory. See [Architecture](architecture.md#gateway-registry-and-authentication).

## Clone and check tools

```bash
git clone https://github.com/shaharia-lab/openshell-webui.git
cd openshell-webui
make deps
```

`make deps` fails when `cargo`, `bun` or `openshell` is missing, and warns when `docker` is missing. Frontend packages install on first use through the internal `frontend-deps` target (`bun install --frozen-lockfile`).

## Run with hot reload

```bash
make dev
```

`make dev` starts two processes and stops both on Ctrl+C:

| Process | Target | Address | Reloads on |
|---|---|---|---|
| Backend | `make backend-dev` | `127.0.0.1:8787` (`ADDR`) | changes in `backend/src`, `backend/proto`, `build.rs`, `Cargo.toml` |
| Frontend | `make frontend-dev` | `http://localhost:5173` | any frontend change (Vite HMR) |

Open the Vite URL, `http://localhost:5173`. The dev backend has no embedded UI: opening `127.0.0.1:8787` directly shows a short "API only" page from `backend/src/http/assets.rs`.

### How the Vite proxy works

`frontend/vite.config.ts` proxies `/api`, including WebSockets, to the backend:

- The target is `OPENSHELL_UI_BACKEND`, default `http://127.0.0.1:8787`. `make frontend-dev` sets it to `http://$(ADDR)`.
- `changeOrigin: true` rewrites `Host` to the backend address, so the Host allowlist accepts it.
- The proxy rewrites `Origin` to the backend URL on requests that carry one and on every WebSocket upgrade. The backend accepts writes and upgrades only when `Origin` matches its own host (`backend/src/http/guard.rs`).

### Run one side only

```bash
make backend-dev                          # backend only, cargo watch
make frontend-dev                         # Vite only, proxies to $(ADDR)
cd frontend && OPENSHELL_UI_BACKEND=http://127.0.0.1:8788 bun run dev
cd backend && cargo run -- --addr 127.0.0.1:8788
```

## Pass flags with `ADDR` and `ARGS`

The `Makefile` passes two variables to the backend:

| Variable | Default | Used by |
|---|---|---|
| `ADDR` | `127.0.0.1:8787` | `backend-dev`, `frontend-dev` (proxy target), `run` |
| `ARGS` | empty | `backend-dev`, `run` |

```bash
make dev ADDR=127.0.0.1:9000
make dev ARGS=--read-only
make backend-dev ARGS="--timeout-secs 60 --no-update-check"
```

Every flag also has an `OPENSHELL_UI_*` environment variable. Run `cargo run -- --help` in `backend/`, or see `backend/src/config.rs` and the [configuration reference](../user-guide/configuration.md).

## Use a non-default gateway

The UI lists every gateway in the registry and lets you switch in the sidebar. The one selected first is the CLI's active gateway:

- `$OPENSHELL_GATEWAY` when set, otherwise the `active_gateway` file in the registry (`backend/src/gateway/registry.rs`).
- Register another gateway with the CLI (`openshell gateway add ...`). The WebUI picks it up on the next `/api/gateways` call; no restart is needed.
- To use a different registry, set `XDG_CONFIG_HOME` before you start the backend. The registry is `$XDG_CONFIG_HOME/openshell`.

```bash
OPENSHELL_GATEWAY=staging make backend-dev
```

Gateways with Cloudflare edge auth are not supported yet; calls to them fail with a clear error (`backend/src/gateway/client.rs`).

## Build and run a release binary

```bash
make build      # bin/openshell-webui with the frontend embedded
make run        # deps + gateway-up + build, then open the browser
```

- `make build` runs `bun run build` in `frontend/`, then `cargo build --release --locked --features embed-frontend`.
- `make run` also runs `make gateway-up`, which starts the local gateway through `systemctl --user` or `brew services` when `openshell status` fails.
- `make run ARGS=--read-only` and `make run ADDR=127.0.0.1:9000` work as in dev.

## Test safely with `--read-only`

Start with `ARGS=--read-only` when you point a dev build at a shared or real gateway:

- Every allowlisted `Write` method returns `403` before it reaches the gateway (`backend/src/http/calls.rs`).
- The terminal WebSocket and file uploads, mkdir and delete are refused (`backend/src/http/terminal.rs`, `backend/src/http/files.rs`).
- The UI disables write buttons and explains why (`WriteButton`).

## Common problems

| Symptom | Cause and fix |
|---|---|
| `cargo-watch not found` | Run `cargo install cargo-watch`. |
| `openshell not found` from `make dev` | `make deps` requires the CLI. Install it, or run `make backend-dev` and `make frontend-dev` separately. |
| The UI shows no gateways | The registry is empty or elsewhere. Run `openshell gateway list` and check `XDG_CONFIG_HOME`. |
| `unexpected Host header` (421) | You opened the backend through a name it does not know. Use `127.0.0.1` or `localhost`, or pass `--allowed-host`. |
| `missing or foreign Origin` (403) on writes | You called the backend directly from another origin, or bypassed the Vite proxy. Use the Vite URL. |
| `missing or invalid CSRF token` | The backend restarted with a new token. The client refetches it and retries once (`frontend/src/api/client.ts`); reload if it persists. |
| `gateway unreachable` (503) | The gateway is down. Run `openshell status`, or `make gateway-up`. |
| OIDC `Unauthenticated` errors | The token in `oidc_token.json` expired. Run any `openshell` command for that gateway, or `openshell gateway login <name>`. |
| No container stats on the Overview (`/api/local/containers` returns 503) | The `docker` CLI is not on `PATH`. Install Docker or ignore it; the rest of the UI works. |
| `bun run gen:types` fails | Install `protoc`, and run `bun install` so `ts-proto` is in `node_modules`. |

## Related

- [Architecture](architecture.md)
- [Testing](testing.md)
- [User guide: troubleshooting](../user-guide/troubleshooting.md)
- [User guide: configuration](../user-guide/configuration.md)
