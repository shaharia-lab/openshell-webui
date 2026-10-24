# Configuration

This page lists every flag and environment variable of `openshell-webui`, with defaults and
common setups: read-only mode, another port, a reverse proxy, a background service and the
Docker image. It is for anyone who runs the WebUI.

## Flags and environment variables

Each flag can also be set with its environment variable. A flag on the command line wins.

| Flag | Environment | Default | Meaning |
|---|---|---|---|
| `--addr <ip:port>` | `OPENSHELL_UI_ADDR` | `127.0.0.1:8787` | Listen address. Keep it on loopback: the WebUI has no login. |
| `--open` | none | off | Open the UI in the default browser after start (`open` on macOS, `xdg-open` elsewhere) |
| `--read-only` | `OPENSHELL_UI_READ_ONLY` | off | Refuse every action that changes state |
| `--audit-log <file>` | `OPENSHELL_UI_AUDIT_LOG` | `$XDG_STATE_HOME/openshell-ui/audit.jsonl` | JSON-lines file that records every write |
| `--gateway-log-dir <dir>` | `OPENSHELL_UI_GATEWAY_LOG_DIR` | Homebrew log directory, else the systemd journal | Directory with `openshell-gateway.out.log` and `openshell-gateway.err.log` of the local gateway |
| `--allowed-host <host>` | `OPENSHELL_UI_ALLOWED_HOSTS` | none | Extra `Host` header values to accept, for a reverse proxy. Repeat the flag or separate values with commas. |
| `--timeout-secs <n>` | `OPENSHELL_UI_TIMEOUT` | `20` | Timeout for one gateway call, in seconds |
| `--no-update-check` | `OPENSHELL_UI_NO_UPDATE_CHECK` | off | Never ask GitHub for the latest release |
| `--help`, `--version` | none | | Print help or the version |

The on/off variables accept `true`/`false`, `1`/`0`, `yes`/`no` and `on`/`off`, for example
`OPENSHELL_UI_READ_ONLY=1`. Any other value is rejected at startup.

### Other environment variables

The WebUI also reads these standard variables:

| Variable | Used for |
|---|---|
| `XDG_CONFIG_HOME` | Where the OpenShell CLI registry is: `$XDG_CONFIG_HOME/openshell`, by default `~/.config/openshell` |
| `OPENSHELL_GATEWAY` | Which gateway counts as active, instead of the CLI's `active_gateway` file. The UI selects it on first load. |
| `XDG_STATE_HOME` | Base of the default audit log path, by default `~/.local/state` |
| `DOCKER_HOST` | Which Docker engine to ask for container stats (see [Docker engine](#docker-engine)) |
| `RUST_LOG` | Server log verbosity, for example `RUST_LOG=debug`. Default `info`. |
| `PATH` | Where to find `docker`, `openshell`, `brew` and `journalctl`. Each is optional. |

## Timeouts

- Reads time out after `--timeout-secs` (20 seconds by default).
- Writes, such as creating a sandbox, get at least 60 seconds, or `--timeout-secs` if that is
  longer.
- For live log streams, the timeout applies only to opening the stream.

## Read-only mode

```bash
openshell-webui --read-only
```

In read-only mode the server refuses every write before it reaches the gateway. That includes
the terminal, file uploads, edits and deletes in the file browser. Write buttons are disabled
with the tooltip **The WebUI runs in read-only mode.**, and the top bar shows **Read-only**
instead of **Read-write**.

> [!TIP]
> Use `--read-only` on a shared or production gateway to look around safely.

## Run on another port

```bash
openshell-webui --addr 127.0.0.1:9000
```

Then open `http://127.0.0.1:9000`. The server accepts `127.0.0.1`, `localhost` and `[::1]`
with that port as the `Host`. The startup log line prints the URL, the mode and the audit log
path.

## Audit log

Every write through the WebUI appends one JSON line: time, gateway, workspace, method, target
and result. Credentials and request bodies are never written. The file is created with mode
`0600`.

| Setting | Path |
|---|---|
| Default | `$XDG_STATE_HOME/openshell-ui/audit.jsonl`, else `~/.local/state/openshell-ui/audit.jsonl` (also on macOS) |
| Custom | `--audit-log /path/to/audit.jsonl` |
| Docker image | `/home/app/.local/state/openshell-ui/audit.jsonl` (keep it with a volume) |

View it on **Gateway** > **Audit log**, which also shows the path. If the file cannot be
written, the action still happens and the server logs an error.

## Update check

The sidebar footer shows the WebUI version and the version of the `openshell` CLI on your
`PATH` (or **OpenShell CLI not found**). When a newer release exists, it shows **Update
available**.

To know that, the backend asks GitHub's API for the latest release. It asks at most once
every six hours, or 30 minutes after a failed check. The request carries no gateway data.
Turn it off with `--no-update-check`.

## Docker engine

The **Overview** page shows live CPU and memory of local OpenShell containers. For that, the
WebUI runs the `docker` CLI. If `DOCKER_HOST` is unset, it uses the `DOCKER_HOST=` line from
`~/.config/openshell/gateway.env`, so it talks to the same engine as the gateway. Without a
`docker` CLI, container stats are off; everything else works.

## Behind a reverse proxy

The server rejects requests whose `Host` header it does not know. To put it behind a proxy
that sends another `Host`, list that value:

```bash
openshell-webui --allowed-host webui.example.internal
```

Include the port if the proxy sends one, for example `webui.example.internal:8443`.

> [!WARNING]
> There is no login. Anyone who can reach the WebUI acts as your gateway identity, with your
> roles. Only expose it through a proxy that authenticates users, and consider
> `--read-only`.

> [!NOTE]
> Writes and terminal sessions also require the browser's `Origin` to match the `Host`:
> `http://<Host>` or, behind a proxy that serves HTTPS, `https://<Host>`. Make sure the proxy
> passes the original `Host` header through.

## Run in the background

Run it as a systemd user service on Linux. Save this as
`~/.config/systemd/user/openshell-webui.service`, adjusting the binary path:

```ini
[Unit]
Description=OpenShell WebUI

[Service]
ExecStart=%h/.local/bin/openshell-webui --addr 127.0.0.1:8787
Restart=on-failure

[Install]
WantedBy=default.target
```

Then enable and start it:

```bash
systemctl --user daemon-reload
systemctl --user enable --now openshell-webui
journalctl --user -u openshell-webui -f   # server log
```

The service runs as you, so it reads the same CLI registry and credentials.

## Docker image

The image `ghcr.io/shaharia-lab/openshell-webui` runs the same binary. Add WebUI flags after
the image name.

```bash
docker run --rm --name openshell-webui \
  --network host \
  --user "$(id -u):$(id -g)" \
  -v ~/.config/openshell:/home/app/.config/openshell:ro \
  -v openshell-webui-state:/home/app/.local/state \
  ghcr.io/shaharia-lab/openshell-webui:latest --read-only
```

| Docker option | Why |
|---|---|
| `--network host` | A local gateway listens on `127.0.0.1` only. The WebUI still listens on loopback. |
| `--user "$(id -u):$(id -g)"` | Lets the WebUI read your mTLS key, which is `0600` |
| `-v ~/.config/openshell:...:ro` | The CLI registry and credentials, read-only |
| `-v openshell-webui-state:...` | Keeps the audit log across restarts |

The image has no `docker`, `openshell`, `brew` or `journalctl`. So the **Overview** has no
container stats, the sidebar says **OpenShell CLI not found**, and the gateway service log is
empty unless you mount a log directory and pass `--gateway-log-dir`. `--open` does nothing in
the container. Everything that goes through the gateway works.

## Related

- [Getting started](getting-started.md)
- [Security](security.md)
- [Troubleshooting](troubleshooting.md)
- [Logs](logs.md)
