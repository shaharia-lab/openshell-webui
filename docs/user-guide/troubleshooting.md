# Troubleshooting

This page lists common problems with the WebUI, what causes them, and how to fix them. Find
your symptom or the exact error text, then follow the fix.

Most gateway errors are passed through unchanged, so the OpenShell CLI often shows the same
message. Check `openshell status` first: if the CLI cannot reach the gateway, neither can the
WebUI.

## Startup

### Address already in use

**Symptom:** the WebUI exits at start with `Error: Address already in use (os error 98)` (on
macOS, `os error 48`).

**Cause:** another process, often a second WebUI, listens on `127.0.0.1:8787`.

**Fix:** stop the other process, or pick another port:

```bash
openshell-webui --addr 127.0.0.1:9000
```

### Invalid value for an environment variable

**Symptom:** the WebUI exits with `invalid value '...'` for `--read-only` or another on/off
option.

**Cause:** on/off variables such as `OPENSHELL_UI_READ_ONLY` accept only `true`/`false`,
`1`/`0`, `yes`/`no` or `on`/`off`.

**Fix:** use one of those values, for example `OPENSHELL_UI_READ_ONLY=1`. See
[Configuration](configuration.md).

## Gateways

### No gateways registered

**Symptom:** the page shows **No gateways registered**, or an API error says
`gateway "<name>" is not registered; add it with openshell gateway add`.

**Cause:** the WebUI lists the gateways in the CLI registry, `~/.config/openshell/gateways/`
(or `$XDG_CONFIG_HOME/openshell/gateways/`). It is empty, or the WebUI runs as a different user
or with a different `HOME`.

**Fix:**

1. Register the gateway with the CLI: `openshell gateway add <endpoint>`.
2. Check that `openshell gateway list` shows it, and that
   `~/.config/openshell/gateways/<name>/metadata.json` exists.
3. In Docker, check that you mounted `~/.config/openshell` to `/home/app/.config/openshell`.
4. Reload the page.

If the page says **Could not read the gateway registry**, the directory exists but the WebUI
user cannot read it. Fix the permissions or run the WebUI as the CLI user.

### Gateway unreachable or unhealthy

**Symptom:** the top bar shows **Unreachable**, or errors say `gateway unreachable: ...` or
`gateway did not answer in time`.

**Cause:** the gateway is down, or the WebUI cannot reach its endpoint.

**Fix:**

1. Run `openshell status`. It should say `Connected`. If not, start or fix the gateway first.
2. In Docker, use `--network host`. A local gateway listens on `127.0.0.1` only, which a
   container on Docker's default bridge network cannot reach.
3. For a slow gateway, raise the timeout: `--timeout-secs 60`.

A **Health** badge other than **Healthy** (for example **Degraded**) comes from the gateway
itself. Check the gateway's own log (**Gateway** > **Service log** for a local gateway).

### OIDC token expired or missing

**Symptom:** calls fail with one of these:

- `OIDC token expired; run any openshell command for <name> to refresh it, or openshell gateway login <name>`
- `no OIDC token; run openshell gateway login <name>`
- `unreadable OIDC token; run openshell gateway login <name>`

**Cause:** the WebUI sends the CLI's token from
`~/.config/openshell/gateways/<name>/oidc_token.json`. It does not refresh the token itself.

**Fix:** run any CLI command against that gateway, such as `openshell status`, or run
`openshell gateway login <name>`. The WebUI re-reads the token on every call, so you do not
need to restart it.

### mTLS client certificate not found (Docker)

**Symptom:** in the Docker image, calls fail with
`gateway "<name>": mTLS client certificate not found in /home/app/.config/openshell/gateways/<name>/mtls`.

**Cause:** the client key `tls.key` is readable only by its owner (`0600`). The container runs
as another user and cannot read it, which the WebUI reports as missing.

**Fix:** run the container as yourself with `--user "$(id -u):$(id -g)"`. Outside Docker, check
that `mtls/tls.crt` and `mtls/tls.key` exist in the gateway's directory and that your user can
read them.

### Cloudflare edge gateways

**Symptom:** `gateway "<name>" uses Cloudflare edge auth, which the WebUI does not support yet`.

**Cause:** the WebUI supports mTLS, OIDC and plaintext gateways only.

**Fix:** use the CLI for that gateway.

### Permission denied from the gateway

**Symptom:** an action fails with a permission or authentication error that names a role,
scope or workspace, while the button was enabled.

**Cause:** the gateway refused the call for your identity. The WebUI has no roles of its own.

**Fix:** open **Gateway** > **Overview** and check **Your identity** (**Roles**, **Scopes**).
Ask a workspace or platform admin to add you to the workspace or grant the role. See
[Workspaces and gateway](workspaces-and-gateway.md#roles).

## Writes and access

### Buttons are greyed out

**Symptom:** write buttons are disabled with the tooltip **The WebUI runs in read-only mode.**,
the top bar says **Read-only**, the **Terminal** tab says **Terminal unavailable**, or an API
call returns `the WebUI runs in read-only mode`.

**Cause:** the WebUI was started with `--read-only` or `OPENSHELL_UI_READ_ONLY=true`.

**Fix:** restart it without that flag or variable. If **Terminal unavailable** says the sandbox
must be ready, start the sandbox instead.

### Rejected behind a reverse proxy

| Error | Cause | Fix |
|---|---|---|
| `unexpected Host header` (HTTP 421) | The proxy sends a `Host` the WebUI does not know | Start with `--allowed-host <host>` (include the port if the proxy sends one) |
| `missing or foreign Origin` (HTTP 403) on writes or the terminal | The browser's `Origin` does not match the `Host` the WebUI sees, usually because the proxy rewrites `Host` | Pass the original `Host` through, and allow it with `--allowed-host`. `http://` and `https://` origins both work. |
| `cross-site request refused` (HTTP 403) | An API request came from another site | Open the WebUI directly, not embedded or called from another site |

> [!WARNING]
> There is no login. Only expose the WebUI through a proxy that authenticates users. See
> [Security](security.md).

### Missing or invalid CSRF token

**Symptom:** a write fails with `missing or invalid CSRF token`.

**Cause:** the WebUI restarted and made a new token, and the page still had the old one. The
page normally fetches the new token and retries on its own.

**Fix:** reload the page.

## Sandboxes and policies

### Creating from a template fails

**Symptom:** creating a sandbox with a **Template** fails with
`spec.environment cannot be set when workload_template_name is set`, or the same message for
`spec.template`, `spec.resource_requirements` or `spec.log_level`.

**Cause:** the template supplies the workload: image, resources, GPUs and environment. The
gateway rejects those fields on a sandbox created from a template.

**Fix:** leave those fields empty. Current WebUI versions show them as **Set by the template**
and do not send them; update if yours does. To change the environment, create a template with
it, or create the sandbox without a template. See [Templates](templates.md).

### Sandbox created, but its network rules were not added

**Symptom:** a warning says `<name> was created, but its network rules were not added`.

**Cause:** with **Gateway default** as the base, the WebUI creates the sandbox first and then
merges your rules. The merge failed; the message says why.

**Fix:** add the rules on the sandbox's **Policy** tab with **Add rules**.

### This policy needs provider `<name>` attached

**Symptom:** **Create sandbox** fails with `credential_binding references provider '<name>', but
that provider is not attached to the sandbox`.

**Cause:** an endpoint in the policy has `credential_binding: {provider: <name>}`. The gateway
only sends a provider's credentials to sandboxes that attach it.

**Fix:** select **Attach `<name>` and create**, or tick the provider under **Providers**. If the
provider does not exist yet, create it on the **Providers** page.

### A rule cannot be added: endpoint already has another access level

**Symptom:** **Add rules** says `<host:port> already has rule <name> with <level> access`.

**Cause:** the gateway keeps one access level per `host:port` and would silently ignore the
new one.

**Fix:** remove the existing rule first, or edit the policy with **Edit YAML**.

### Policy YAML is rejected

| Error | Fix |
|---|---|
| `parse document: ...` | Fix the YAML or JSON syntax at the position given |
| `document must be a mapping` or `document is empty` | Paste a whole policy document, not a list or a single value |
| `use either filesystem_policy or filesystem, not both` | Keep one of the two spellings |
| `policy: ...` naming an unknown field | Remove or correct the field; unknown fields are never guessed |

Select **Check** to parse a document without applying it. The gateway validates the result
again when you select **Apply policy**. See [Policies and proposals](policies-and-proposals.md).

### Approve all left some proposals pending

**Cause:** **Approve all** skips proposals with security notes, and the gateway may skip stale
or conflicting ones. The toast reports how many were skipped.

**Fix:** review the remaining proposals one by one.

## Terminal and files

### Cannot copy text from the terminal while Claude Code runs

**Cause:** Claude Code captures the mouse, so dragging does not select text.

**Fix:** hold **Shift** while you drag (**Option** on macOS) to select, then press
**Ctrl+Shift+C** (or **Ctrl+C** while text is selected). Or start Claude Code with
`CLAUDE_CODE_DISABLE_MOUSE=1`. See [Terminal and files](terminal-and-files.md).

### The terminal session is gone after a page refresh

**Cause:** expected. A terminal session lives as long as its browser tab. Closing the tab,
reloading or leaving the page ends it. The WebUI cannot reattach to an old session.

**Fix:** run long tasks inside `tmux` (or `screen`) in the sandbox, if the image has it. After
a refresh, open the terminal and run `tmux attach`.

### File too large

**Symptom:** a download fails with `output is larger than 67108864 bytes`, or an upload is
refused.

**Cause:** the file browser moves files up to 64 MiB. A folder listing is limited to 8 MiB,
and each operation to 120 seconds (`command did not finish in time`).

**Fix:** move large files another way, for example with the CLI.

## Overview and logs

### Container stats are unavailable: docker CLI not available

**Symptom:** the **Overview** page shows **Container stats are unavailable** with
`docker CLI not available`.

**Cause:** the WebUI could not find a `docker` CLI on its `PATH` at startup. This is always
the case in the WebUI's Docker image, which has no `docker` CLI.

**Fix:** run the native binary on the host, with Docker installed, if you want container stats.
Everything else works without it.

If the error is from Docker itself, for example `Cannot connect to the Docker daemon`, the
WebUI uses `DOCKER_HOST`, or the one in `~/.config/openshell/gateway.env`. Check that it points
to the engine the gateway uses.

### The gateway log is empty or unavailable

**Symptom:** **Gateway** > **Service log** shows **Remote gateway**, **No log lines.**, or
**The gateway log is unavailable**.

**Cause and fix:**

- **Remote gateway**: the service log exists only for a gateway on this machine. Use the
  gateway host's own tools.
- The location shown in the toolbar is `journalctl --user -u openshell-gateway`, but the gateway
  is not a systemd user unit, or `journalctl` is missing (as in the Docker image). Point the
  WebUI at the log files with `--gateway-log-dir <dir>`. The directory must contain
  `openshell-gateway.out.log` or `openshell-gateway.err.log`.
- Homebrew installs log to `$(brew --prefix)/var/log/openshell`. The WebUI finds it only if
  `brew` is on its `PATH`; otherwise pass `--gateway-log-dir`.

### The live log stream stopped

**Symptom:** with **Live** on, **The live stream stopped** shows an error, or the badge says
**Streaming unavailable, polling**.

**Cause:** the gateway ended the stream (the error says why), or the stream could not open.

**Fix:** turn **Live** off and on again. While streaming is unavailable, the viewer keeps
refreshing on the auto-refresh period.

### The sidebar says OpenShell CLI not found

**Cause:** there is no `openshell` binary on the WebUI's `PATH`. This only affects the version
shown; the WebUI talks to gateways directly.

**Fix:** none needed. Install the CLI or fix `PATH` to show the version.

## Related

- [Configuration](configuration.md)
- [Security](security.md)
- [Logs](logs.md)
- [Getting started](getting-started.md)
