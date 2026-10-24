# Getting started

This page shows you how to install OpenShell WebUI, open it for the first time, and pick the
gateway and workspace you want to work in. It is for anyone who already uses the `openshell`
CLI and wants the same work in a browser.

## What the WebUI is

OpenShell WebUI is a local web UI for [OpenShell](https://github.com/NVIDIA/OpenShell)
gateways. It is one small binary: a Rust backend with the React UI embedded.

- It reuses the gateways and credentials your `openshell` CLI already has.
- It listens on `127.0.0.1:8787` by default.
- It can do only what your gateway identity is allowed to do. There are no extra accounts and
  no database.

> [!NOTE]
> OpenShell WebUI is an unofficial, community project. It is not affiliated with, endorsed by,
> or supported by NVIDIA. For OpenShell itself, see the
> [OpenShell documentation](https://docs.nvidia.com/openshell/latest/).

## Prerequisites

| You need | Why | Check |
|---|---|---|
| The `openshell` CLI with at least one registered gateway | The WebUI reads the CLI's gateway registry and credentials | `openshell status` reports `Connected` |
| Docker (optional) | Adds live CPU and memory stats for local sandbox containers | `docker ps` |

If you have no gateway yet, register one with `openshell gateway add`. See
[Manage Gateways](https://docs.nvidia.com/openshell/latest/how-it-works/gateways/overview) in
the OpenShell docs.

The WebUI reads each gateway from `~/.config/openshell/gateways/<name>/` (or
`$XDG_CONFIG_HOME/openshell/gateways/<name>/`). It supports mTLS, OIDC and plaintext gateways.
For OIDC gateways, refresh the token with the CLI when it expires.

## Install

Pick one option. The release binary is the recommended one.

### Option 1: release binary (recommended)

Each release ships one self-contained binary for Linux and macOS on `amd64` and `arm64`.

```bash
os=$(uname -s | tr '[:upper:]' '[:lower:]')                      # linux or darwin
arch=$(uname -m | sed 's/x86_64/amd64/; s/aarch64/arm64/')       # amd64 or arm64
curl -fsSL -o openshell-webui "https://github.com/shaharia-lab/openshell-webui/releases/latest/download/openshell-webui-$os-$arch"
chmod +x openshell-webui
./openshell-webui --open
```

- To keep it on your `PATH`, move the binary to `/usr/local/bin` or `~/.local/bin`.
- Each release also ships a `checksums.txt` (SHA-256).
- On macOS, if you downloaded the binary with a browser, clear the quarantine flag first:
  `xattr -d com.apple.quarantine openshell-webui`.

### Option 2: Docker

Each release publishes `ghcr.io/shaharia-lab/openshell-webui` for `linux/amd64` and
`linux/arm64` (tags `latest`, `X.Y` and `X.Y.Z`).

```bash
docker run --rm --name openshell-webui \
  --network host \
  --user "$(id -u):$(id -g)" \
  -v ~/.config/openshell:/home/app/.config/openshell:ro \
  -v openshell-webui-state:/home/app/.local/state \
  ghcr.io/shaharia-lab/openshell-webui:latest
```

| Option | Why |
|---|---|
| `--network host` | Required. A local gateway listens on `127.0.0.1` only, which Docker's default bridge network cannot reach. |
| `--user "$(id -u):$(id -g)"` | Runs the WebUI as you, so it can read your gateway's mTLS key (mode `0600`). |
| `-v ~/.config/openshell:...:ro` | Mounts the CLI's gateway registry read-only. |
| `-v openshell-webui-state:...` | Keeps the audit log across restarts. |

Add WebUI flags after the image name, for example `--read-only` or `--addr 127.0.0.1:9000`.

> [!WARNING]
> The image has no `docker` CLI and no systemd journal. The Overview's live container stats and
> the local gateway log are not available. Everything that goes through the gateway works. See
> [Troubleshooting](troubleshooting.md).

### Option 3: build from source

You need Rust (stable) and Bun. Check with `cargo --version` and `bun --version`.

```bash
git clone https://github.com/shaharia-lab/openshell-webui.git
cd openshell-webui
make run
```

`make run` checks the tools, starts the local gateway if it is not reachable, builds one
release binary with the UI embedded, and opens the WebUI. `make build` only builds it, to
`bin/openshell-webui`.

## First launch

1. Start the WebUI: `openshell-webui` (add `--open` to open your browser).
2. Open **http://127.0.0.1:8787**.
3. The WebUI selects the gateway that is active in the CLI, or the first registered one.
4. It starts in the `default` workspace.

If the registry has no gateways, the page shows **No gateways registered**. Run
`openshell gateway add`, then reload the page. If the registry cannot be read, the page shows
**Could not read the gateway registry** with a retry button.

## Pick a gateway and workspace

- **Gateway**: open the menu at the top of the sidebar (**OpenShell WebUI**) and pick a gateway.
  You can also click a row in the **Gateways** table on the **Overview** page.
- **Workspace**: use the workspace selector in the top bar. Pick **All workspaces** to see
  every workspace you can access.

Switching the gateway resets the workspace to `default`. The WebUI remembers both choices in
your browser. See [Navigating the WebUI](navigation.md).

## Start in read-only mode

```bash
openshell-webui --read-only
```

In read-only mode the WebUI refuses every change before it reaches the gateway, including
terminal sessions and file uploads. The top bar shows a **Read-only** badge, and write buttons
are disabled with the tooltip "The WebUI runs in read-only mode."

> [!TIP]
> Start with `--read-only` on a shared or production gateway. You can explore safely, then
> restart without the flag when you need to make changes.

Every flag and environment variable is in [Configuration](configuration.md).

## Related

- [Concepts](concepts.md)
- [Navigating the WebUI](navigation.md)
- [Configuration](configuration.md)
- [Troubleshooting](troubleshooting.md)
