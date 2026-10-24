# Security

This page explains, for people running the WebUI, what it can and cannot do with your gateway
credentials and how it protects them. For the implementation and the rules every code change
must follow, see the [developer security guide](../developer-guide/security.md).

## The short version

- The WebUI uses your OpenShell CLI credentials. It acts as your gateway identity.
- It has **no login**. Anyone who can reach its port can do what you can do on the gateway.
- It listens on `127.0.0.1` only, by default. Keep it that way unless you put an
  authenticating proxy in front.
- Start it with `--read-only` when you only need to look.

## What the WebUI can do

The WebUI reads the CLI gateway registry (`~/.config/openshell/gateways/<name>/`) and calls
each gateway with the same credentials as the CLI: an mTLS client certificate, an OIDC token,
or nothing for plaintext gateways.

The gateway checks roles on every call. The WebUI can do only what that identity is allowed to
do. If your identity is a platform admin, so is everyone who can reach the WebUI.

## What the WebUI cannot do

- **Call arbitrary gateway methods.** The browser can reach only an allowlist of gateway
  methods. Sandbox-token, supervisor, peer and credential-export methods are not on it.
- **Show secrets.** Provider credentials and other fields the OpenShell API marks as secret are
  replaced with `[redacted]` before any response leaves the server. After you save a secret,
  nobody can read it back through the WebUI.
- **Overwrite a secret with the mask.** A request that sends `[redacted]` back as a secret value
  is refused: "request contains a redacted value ([redacted]); enter the real secret or leave
  the field out".
- **Change anything in read-only mode.** See below.

## No login

> [!WARNING]
> The WebUI has no user accounts. Anyone who can open its address acts as your gateway
> identity, with your roles. Do not expose it to other people without an authenticating
> reverse proxy in front.

To protect the default setup:

| Guard | What it stops |
|---|---|
| Listens on `127.0.0.1:8787` by default | Access from other machines on your network |
| Rejects unknown `Host` headers | DNS rebinding, where a malicious site points its name at `127.0.0.1` |
| Refuses cross-site API requests (`Sec-Fetch-Site`) | Other sites in your browser reading gateway data |
| Requires a same-origin `Origin` and a CSRF token on every write and terminal session | Other sites in your browser making changes |
| Strict Content Security Policy (`script-src 'self'`), no third-party scripts or fonts | Injected or remote scripts running in the page |

The CSRF token is new each time the server starts. The browser fetches it again on its own.

To serve the WebUI through a proxy, see
[Configuration](configuration.md#behind-a-reverse-proxy).

## Read-only mode

Start with `--read-only` (or `OPENSHELL_UI_READ_ONLY=true`) and the server refuses every
action that changes state, before it reaches the gateway:

- creating, changing or deleting anything
- the terminal
- uploads, edits and deletes in the file browser

The top bar shows **Read-only**, and write buttons are disabled with **The WebUI runs in
read-only mode.** Refused requests return "the WebUI runs in read-only mode".

## Audit log

Every write through the WebUI is appended to a JSON-lines file: time, gateway, workspace,
method, the target it acted on (names and IDs) and the result. Credentials and request bodies,
such as policies or secret values, are never written. The file is created with mode `0600`.

Find it on **Gateway** > **Audit log**, or see [Configuration](configuration.md#audit-log) for
the path. Actions you take with the CLI or other clients are not in this log; the gateway
keeps its own records.

## Data that leaves your machine

- Gateway calls go only to the gateways in your CLI registry.
- The update check asks GitHub's API for the latest WebUI release, at most every six hours.
  It sends no gateway data. Turn it off with `--no-update-check`.
- The frontend loads no third-party scripts, fonts or analytics.

## Report a problem

Report security issues privately through
[GitHub security advisories](https://github.com/shaharia-lab/openshell-webui/security/advisories/new),
not in a public issue.

## Related

- [Configuration](configuration.md)
- [Workspaces and gateway](workspaces-and-gateway.md)
- [Developer security guide](../developer-guide/security.md)
