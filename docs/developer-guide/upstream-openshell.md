# Upstream OpenShell

This page explains how the WebUI tracks [OpenShell](https://github.com/NVIDIA/OpenShell): how the protos are copied, how to check that a feature behaves like the CLI, which RPCs stay blocked, and what to do after an upstream release.

## How the WebUI tracks upstream

The WebUI speaks the gateway's gRPC API directly. Its only copy of that API is four proto files:

| File in `backend/proto/` | Package |
|---|---|
| `openshell.proto` | `openshell.v1`, the `OpenShell` service |
| `datamodel.proto` | `openshell.datamodel.v1` |
| `sandbox.proto` | `openshell.sandbox.v1` (policy) |
| `options.proto` | `openshell.options.v1` (the `secret` annotation) |

- `backend/proto/SOURCE_COMMIT` records the short upstream commit the files came from.
- Never edit these files. Change behavior in WebUI code instead, or upstream.
- `backend/build.rs` compiles them on every backend build. `frontend/src/gen/` holds the TypeScript types generated from the same files.

Everything downstream follows the protos automatically: method lookup (`reflect.rs`), JSON mapping, secret redaction (`redact.rs`) and the fake gateway's stubs in tests.

## Refresh the protos

```bash
make proto OPENSHELL_SRC=/path/to/OpenShell
```

`make proto`:

1. Copies `openshell`, `datamodel`, `sandbox` and `options` `.proto` from `$OPENSHELL_SRC/proto/` into `backend/proto/`.
2. Writes `git -C $OPENSHELL_SRC rev-parse --short HEAD` to `backend/proto/SOURCE_COMMIT`.
3. Runs `bun run gen:types` in `frontend/`, which needs `protoc` on your `PATH`.

`OPENSHELL_SRC` defaults to `$(HOME)/Projects/OpenShell`. Check out the upstream commit or tag you want first. The backend regenerates its code on the next `cargo build`.

Then run `make lint test`. Type errors in `frontend/` and failures in `rpcs.rs` tests show what changed.

## Check feature parity with the CLI

The CLI is the reference client. When you add or change a dialog, compare it with two places upstream:

| Upstream source | What to look for |
|---|---|
| [`crates/openshell-cli`](https://github.com/NVIDIA/OpenShell/tree/main/crates/openshell-cli) | The command's flags, defaults, `conflicts_with_all`, and how flags map to request fields |
| [`crates/openshell-server/src/grpc/`](https://github.com/NVIDIA/OpenShell/tree/main/crates/openshell-server/src/grpc) (`sandbox.rs`, `provider.rs`, `policy.rs`, `service.rs`, `workspace.rs`, `validation.rs`) | Validation that rejects field combinations with `InvalidArgument` |
| [`docs/`](https://github.com/NVIDIA/OpenShell/tree/main/docs) | The documented behavior users expect |

A useful routine:

1. Find the CLI command and read its argument struct and its tests.
2. Find the gRPC handler and its `validate_*` functions.
3. List which request fields the CLI sets for each flag combination.
4. Make the dialog send the same fields, and hide or disable inputs the server would reject.
5. Put the request building in a pure function and unit-test each combination.

### Worked example: sandbox templates

A workload template supplies the image, resources, GPUs and environment for a new sandbox.

**Upstream CLI.** In `crates/openshell-cli/src/main.rs`, `sandbox create --template` has `conflicts_with_all = ["from", "gpu", "cpu", "memory", "driver_config_json", "envs", "env_from"]`. The test `sandbox_create_template_conflicts_with_inline_workload_flags` covers it.

**Upstream server.** In `crates/openshell-server/src/grpc/sandbox.rs`, `validate_template_create_governance_spec` rejects a `CreateSandboxRequest` with `workload_template` set when the spec also has:

- `spec.log_level`
- `spec.environment`
- `spec.template`
- `spec.resource_requirements`

**WebUI.** `createSandboxRequest` in `frontend/src/features/sandboxes/create/request.ts` builds the request:

- Without a template, it sends `spec.template` (image, CPU and memory limits), `spec.environment` and `spec.resource_requirements` (GPU).
- With a template, it sets `workload_template` and omits all of those. It still sends per-sandbox fields: command, providers, policy, restart policy, labels and service exposures.
- `create-sandbox-dialog.tsx` disables the image, CPU and memory inputs while a template is selected, hides the GPU and environment editors, and says the values are set by the template.
- `frontend/src/features/sandboxes/__tests__/create-request.test.ts` checks both shapes.

The dialog never sets `spec.log_level`, so that rule needs no extra handling today. Re-check it if you add a log level input.

## RPCs that stay blocked

The browser can reach only the methods in `ALLOWED` in `backend/src/rpcs.rs`. These must never be added:

| RPC or group | Why |
|---|---|
| `IssueSandboxToken`, `RefreshSandboxToken` | Mint sandbox identity tokens. A browser holding one could act as a sandbox. |
| `GetProviderCredentials`, `GetSandboxProviderEnvironment`, `ExchangeProviderSubjectToken` | Export provider credentials or exchange tokens. Credentials are write-only in the UI by design. |
| `ConnectSupervisor`, `RelayStream`, `Report*`, `PushSandboxLogs`, `SubmitPolicyAnalysis`, `ReportMainProcessExit`, `FinalizeMainProcessExit` | Supervisor-side RPCs that sandboxes call, not operators. |
| `PeerRelay`, `Peer*` | Gateway-to-gateway RPCs. |
| `CreateSshSession`, `RevokeSshSession`, `ForwardTcp`, `BeginRootfsTarStaging` | Session and transport plumbing for the CLI. The WebUI has its own terminal and file browser. |

The generic endpoint also accepts only unary methods; the test `every_allowlisted_method_exists_and_is_unary` enforces it. Streaming features (watch, terminal) get their own route with their own guards.

`sensitive_methods_are_not_allowlisted` in `rpcs.rs` asserts a subset of the first two rows. Extend it when you notice a new sensitive method upstream.

## After an upstream release

1. Check out the release tag in your OpenShell checkout.
2. Run `make proto OPENSHELL_SRC=...` and review `git diff backend/proto/`.
3. For each new RPC, decide: allowlist it (`Read` or `Write`), give it a route, or leave it blocked. Read its `(openshell.options.v1.authorization)` option and its handler.
4. For each new field marked `(openshell.options.v1.secret)`, confirm the UI treats it as write-only. Redaction is automatic.
5. For changed request messages, diff the CLI flags and server validation as above and update the dialogs.
6. Run `make lint test`, then try the changed pages against a real gateway, `--read-only` first.
7. Note the new `SOURCE_COMMIT` and the user-visible changes in the pull request.

## Related

- [Recipes: refresh protos](recipes.md#refresh-protos)
- [Security](security.md)
- [Backend](backend.md)
- [User guide: concepts](../user-guide/concepts.md)
