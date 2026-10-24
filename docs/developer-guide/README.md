# Developer guide

This guide is for contributors who want to run OpenShell WebUI locally, understand how it works, and change it without breaking its security model or drifting from upstream [OpenShell](https://github.com/NVIDIA/OpenShell).

## Start here

1. Set up your machine and run `make dev`: [Local development](local-development.md).
2. Read the big picture and the request flows: [Architecture](architecture.md).
3. Read the rules every change must keep: [Security](security.md).
4. Pick a recipe for your change: [Recipes](recipes.md).
5. Run `make lint test` before you open a pull request: [Testing](testing.md).

## Pages

| Page | What it covers |
|---|---|
| [Local development](local-development.md) | Prerequisites, `make` targets, ports, the Vite proxy, running against another gateway, common problems |
| [Architecture](architecture.md) | Components, request lifecycles (reads, RPC calls, SSE, WebSocket, files), reflection, redaction, embedding |
| [Backend](backend.md) | Rust module map, API route table, error format, adding routes and methods, backend tests |
| [Frontend](frontend.md) | React stack, layout, conventions, routing, forms, tables, read-only mode, generated types, tests |
| [Upstream OpenShell](upstream-openshell.md) | Tracking upstream protos, checking feature parity with the CLI, RPCs that stay blocked |
| [Security](security.md) | The security invariants, where each is enforced, the threat model, a review checklist |
| [Testing](testing.md) | `make test` and `make lint`, the fake gateway, MSW handlers, CI, manual checks |
| [Recipes](recipes.md) | Step-by-step changes: expose a method, add a read route, add a page or dialog, refresh protos |
| [Releasing](releasing.md) | Versioning, tags, release binaries, the Docker image, the `claude-sandbox` example image |

## Ground rules

- Read `CLAUDE.md` at the repo root. It is the short version of this guide and applies to humans and AI agents alike.
- Never edit `backend/proto/`. Refresh it with `make proto`.
- Run `make lint test` before you finish any change.

## Related

- [User guide](../user-guide/README.md)
- [Architecture](architecture.md)
- [Security](security.md)
