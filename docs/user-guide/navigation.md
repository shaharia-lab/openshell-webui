# Navigating the WebUI

This page describes the app shell: the sidebar, the top bar, the command palette and the
**Overview** page. It is for anyone who wants to find their way around quickly.

## Layout

The WebUI has two fixed areas around the page content:

- The **sidebar** on the left: gateway menu, page links, your identity and version info.
- The **top bar**: workspace selector, gateway status, search, refresh and theme.

Every page works on the selected gateway and workspace.

## Sidebar

The sidebar groups pages into three sections:

| Section | Pages |
|---|---|
| **Workloads** | **Overview**, **Sandboxes**, **Logs**, **Services** |
| **Configuration** | **Providers**, **Provider profiles**, **Templates** |
| **Administration** | **Workspaces**, **Gateway** |

- The **Sandboxes** link shows the number of sandboxes in the current scope.
- To collapse the sidebar to icons, click the toggle in the top bar or press `Ctrl+B`
  (`⌘+B` on macOS).

The sidebar footer shows:

- **Your identity**: the name or subject the gateway sees, your roles and identity provider.
  Click it to open the **Gateway** page. A shield icon shows whether the WebUI is read-write or
  read-only.
- **Version info**: the WebUI version, the version of the `openshell` CLI on your `PATH`, and a
  link to the repository. When a newer release exists, an **Update available** entry links to it.

## Gateway switcher

The menu at the top of the sidebar shows **OpenShell WebUI**, the selected gateway, and whether
it is `local` or `remote`.

1. Click the menu.
2. Under **Gateways (from the OpenShell CLI)**, pick a gateway. Each entry shows its endpoint.
   The CLI's active gateway is marked **(CLI active)**.

To add a gateway, run `openshell gateway add` and reload the page. Switching the gateway resets
the workspace to `default`.

## Workspace selector

The selector in the top bar lists the workspaces you can see on the selected gateway, plus
**All workspaces**.

With **All workspaces** selected:

- Lists such as **Sandboxes**, **Services** and **Templates** show every workspace you can
  access, with a **Workspace** column.
- The **New sandbox** dialog asks you to pick a workspace.
- **New template** is disabled: "Select one workspace to create a template in."
- **Provider profiles** asks you to pick a workspace, and the Overview's **Profiles** card shows
  `—`. Profiles belong to one workspace; the gateway does not list them across workspaces.

Listing across workspaces needs the platform admin role on gateways that enforce roles. See
[Workspaces and gateway](workspaces-and-gateway.md).

## Gateway status

Next to the workspace selector (hidden on small screens) you see:

- The health of the selected gateway: **Checking**, **Healthy · v<version>**, or
  **Unreachable**. Hover over **Unreachable** to see the error.
- A **Read-write** or **Read-only** badge. In read-write mode, actions change the gateway and
  are recorded in the audit log.

## Command palette

Press `Ctrl+K` (`⌘+K` on macOS), or click **Search…** in the top bar. Type to filter, then press
`Enter`.

| Group | Items |
|---|---|
| **Sandboxes** | Jump to any sandbox. **Terminal in <name>** for each ready sandbox (read-write mode only) |
| **Pages** | Every page in the sidebar |
| **Actions** | **New sandbox** (read-write mode only), **Toggle theme**, **Refresh now** |
| **Workspace** | Switch workspace, including **All workspaces** |
| **Gateway** | Switch gateway (shown when more than one is registered) |

## Auto-refresh

Pages refresh their data on a timer. The refresh control in the top bar shows the interval.

- Click the refresh button to refresh now.
- Use the arrow next to it to pick **Off**, **Every 5s**, **Every 15s**, **Every 30s** or
  **Every 60s**. The default is 5 seconds.
- While a sandbox changes phase (for example **Starting** or **Stopping**), the WebUI checks it
  every 2 seconds so the change shows promptly.

## Theme

Click the sun or moon icon in the top bar and pick **Light**, **Dark** or **System**. The
default is **System**, which follows your operating system. **Toggle theme** in the command
palette switches between light and dark.

The WebUI stores the theme, gateway, workspace and refresh interval in your browser.

## Read-only indicator

When the WebUI runs with `--read-only`:

- The top bar shows **Read-only**, and the sidebar identity shows a crossed-out shield.
- Write buttons are disabled. Hover over one to see "The WebUI runs in read-only mode."
- Terminal sessions and file changes are refused.

See [Security](security.md).

## Overview page

The **Overview** page summarizes the selected gateway and workspace.

| Part | What it shows |
|---|---|
| **New sandbox** button | Opens the **New sandbox** dialog |
| Stat cards | **Sandboxes** (and how many are ready), **Providers**, **Profiles**, **Services**, **Workspaces**, **Containers** |
| **Recent sandboxes** | The six newest sandboxes with phase, image and age. **View all** opens **Sandboxes** |
| **Gateways** | Every registered gateway: health, endpoint, auth, location, sandbox count and your roles. Click a row to switch to it |
| **Local containers** | OpenShell containers on this machine's Docker engine, with CPU, memory, network I/O and PIDs. Only for a local gateway |

> [!NOTE]
> Container stats need the `docker` CLI on the machine that runs the WebUI. The Docker image
> of the WebUI does not include it. See [Troubleshooting](troubleshooting.md).

## Small screens

On screens narrower than 768 pixels, the sidebar becomes a slide-out panel. Open it with the
toggle at the left of the top bar. Tables hide less important columns, and the gateway status
badges are hidden.

## Related

- [Getting started](getting-started.md)
- [Concepts](concepts.md)
- [Sandboxes](sandboxes.md)
- [Workspaces and gateway](workspaces-and-gateway.md)
