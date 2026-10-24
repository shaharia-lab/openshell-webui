# Logs

This page explains the two kinds of logs in the WebUI: sandbox logs (with network decisions)
and the local gateway's service log. It is for anyone debugging a sandbox or finding out why a
connection was denied.

## Where to find logs

| View | Where | Shows | CLI equivalent |
|---|---|---|---|
| Sandbox logs | **Logs** page (pick a sandbox), or a sandbox's **Logs** tab | Log lines from the sandbox and the gateway about one sandbox, including ALLOWED and DENIED network decisions | `openshell logs <sandbox>` |
| Gateway service log | **Gateway** > **Service log** | The local gateway process's own log | `journalctl --user -u openshell-gateway` |
| Audit log | **Gateway** > **Audit log** | Write actions made through this WebUI | none (see [Security](security.md#audit-log)) |

The **Logs** page and the **Logs** tab use the same viewer. On the **Logs** page, the first
menu picks the sandbox. With **All workspaces** selected, sandboxes show as
`workspace/name`.

## Sandbox logs

### Filters

| Control | Options | Default |
|---|---|---|
| Source | **All sources**, **Sandbox**, **Gateway** | **All sources** |
| Level | **Info and up**, **Warn and up**, **Errors**, **Debug and up**, **Everything** | **Info and up** |
| Since | **Any time**, **Last 5 min**, **Last 30 min**, **Last hour**, **Last day** | **Any time** |
| Lines | **200 lines**, **500 lines**, **1000 lines**, **5000 lines** | **500 lines** |
| **Filter text** | Free text, matched against the message and target | empty |
| **Denied only** | Shows only lines that contain `DENIED` | off |

Source, level, time and line count are sent to the gateway. **Filter text** and **Denied
only** filter the loaded lines in your browser.

Newest lines are at the top. The bar under the toolbar shows how many lines match, how many
are allowed and denied, and the gateway's buffer size.

Select a line with an arrow to expand its structured fields.

### Follow live

Turn on **Live** to stream new lines as they arrive. The WebUI uses Server-Sent Events (SSE)
from the gateway's watch stream, and also shows platform events (source `event`), such as
scheduling and container events.

| Badge | Meaning |
|---|---|
| **Following** | The stream is open |
| `connecting` | The browser is reconnecting on its own |
| **Streaming unavailable, polling** | The stream could not open; the viewer refreshes on the normal auto-refresh period instead |
| `error` | The gateway ended the stream; **The live stream stopped** shows why |

While following, the viewer keeps the last 5000 lines in memory. With **Live** off, the view
refreshes on the auto-refresh period you picked in the top bar.

CLI equivalent: `openshell logs <sandbox> --tail`.

### Spot denied connections

Network decisions are logged as OCSF events. A denied connection looks like this:

```text
NET:OPEN [MED] DENIED /usr/bin/curl(64) -> httpbin.org:443 [policy:- engine:opa]
```

- `ALLOWED` is highlighted green and `DENIED` red. Denied lines also get a red background.
- Turn on **Denied only** to see just the denials.
- The binary path and `host:port` in the line are what a network rule needs.

Each denial usually becomes a proposal. Review it on the sandbox's **Proposals** tab, or add a
rule yourself on the **Policy** tab. See [Policies and proposals](policies-and-proposals.md).

> [!NOTE]
> The denied counter and **Denied only** match both `DENIED` (refused connections and
> requests) and `BLOCKED` (security findings, such as `FINDING:BLOCKED`).

## Gateway service log

**Gateway** > **Service log** shows the last 1000 lines of the gateway service running on
your machine. It is only available when the selected gateway's endpoint is on this machine
(`localhost`, `127.0.0.1` or `::1`). For a remote gateway, the tab shows **Remote gateway**.

| Control | What it does |
|---|---|
| Level | **All levels**, **Warn and up** or **Errors** |
| **Filter text** | Matches the message |
| **Hide successful requests** | Hides access lines for requests that returned 2xx (on by default) |

The log location shows at the right of the toolbar. The WebUI finds it in this order:

1. The directory given with `--gateway-log-dir` (or `OPENSHELL_UI_GATEWAY_LOG_DIR`). It reads
   `openshell-gateway.out.log` and `openshell-gateway.err.log` there.
2. The Homebrew log directory, `$(brew --prefix)/var/log/openshell`, if it exists.
3. The systemd user journal: `journalctl --user -u openshell-gateway`.

If none of these has lines, the tab shows **No log lines.** See
[Troubleshooting](troubleshooting.md#the-gateway-log-is-empty-or-unavailable).

> [!NOTE]
> The service log refreshes on the auto-refresh period. It does not stream.

## Related

- [Policies and proposals](policies-and-proposals.md)
- [Workspaces and gateway](workspaces-and-gateway.md)
- [Configuration](configuration.md)
- [Troubleshooting](troubleshooting.md)
