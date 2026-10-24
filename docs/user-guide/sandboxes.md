# Sandboxes

This page covers the sandbox list, the **New sandbox** dialog, start, stop and delete, and the
sandbox detail page. It is for anyone who creates or manages sandboxes in the WebUI.

## Sandbox list

Open **Sandboxes** in the sidebar. The list shows the sandboxes in the selected workspace (or
in every workspace, with **All workspaces**).

| Column | Shows |
|---|---|
| **Name** | Click to open the detail page |
| **Phase** | **Ready**, **Starting**, **Stopped**, **Error** and so on. See [Concepts](concepts.md#sandbox) |
| **Workspace** | Only with **All workspaces** |
| **Image** | The image, or `default` for the gateway's default image |
| **Providers** | Attached providers |
| **Labels** | Labels as `key=value`. Only on wide screens |
| **Policy** | The current policy version, such as `v3` |
| **Created** | Age |

- Type in **Filter sandboxes** to search every column.
- **Any phase** and **Any provider** narrow the list to one phase or one attached provider.
- The label box takes a selector like the CLI's `--selector`: `team=ml,env=dev` matches
  sandboxes with every listed label. A bare key, such as `team`, matches any value. A
  malformed selector shows the problem instead of the count.
- The count on the right says how many sandboxes match, such as `12 of 340`. **Clear** resets
  every filter.
- Filters are kept in the page URL, so you can bookmark or share a filtered view.
- The **⋯** menu on each row has **Open terminal**, **View logs**, **Start** or **Stop**, and
  **Delete**.

CLI equivalent: `openshell sandbox list` (add `--all-workspaces` for every workspace, and
`--selector team=ml` to filter by label).

## Create a sandbox

1. Click **New sandbox** on the **Sandboxes** or **Overview** page, or run **New sandbox** from
   the command palette.
2. Fill in the fields below. Only **Name** is required.
3. Optional: expand any part of **Policy** or **Runtime**. Each collapsed row shows a summary
   of its value, such as `No access`, `Default` or `2 labels`.
4. Click **Create sandbox**.

The dialog has four parts:

| Part | Holds |
|---|---|
| Top | **Name**, **Workspace**, **Image**, **Template** |
| **Providers** | The credentials the sandbox may use |
| **Policy** | What the sandbox may reach and touch: **Network access**, **Filesystem**, **Process** |
| **Runtime** | How it runs: **Command and restart**, **Resources**, **Environment**, **Labels**, **Expose services** |

The WebUI opens the new sandbox's detail page. If a field in a collapsed section is invalid,
that section opens so you can see the error.

### Main fields

| Field | What it does | Default |
|---|---|---|
| **Name** | Sandbox name. Starts with a letter or digit; letters, digits, `.`, `_`, `-`; up to 63 characters | none |
| **Workspace** | The workspace to create it in. Editable only with **All workspaces** | The selected workspace, or `default` |
| **Image** | OCI image reference, such as `ghcr.io/org/image:tag` | The gateway's default image |
| **Template** | A saved template to take the workload from. See [With a template](#with-a-template) | **None** |
| **Providers** | Search by name or type and tick the providers to attach. Selected ones show as chips above the list; **×** removes one. They inject credentials as placeholders and allow their endpoints | none |

### Policy

Network rules can change after the sandbox exists, on its **Policy** tab. **Filesystem** and
**Process** cannot: the gateway applies them when the sandbox starts and refuses later changes.

The toolbar applies to the whole policy:

- **Start from** picks the base policy: **Gateway default (no network access)** or
  **Copy policy of <sandbox>**.
- **Edit as YAML** switches to a YAML editor for the whole policy. **Back to the form** discards
  YAML changes.
- **Load file** opens a policy file (`.yaml`, `.yml` or `.json`, such as one you would pass to
  `openshell sandbox create --policy`) in the YAML editor. It is handled exactly like pasted
  YAML.

#### Network access

Each row has a **Binary path** (an absolute path such as `/usr/bin/curl`), a **Host and port**
(such as `api.github.com:443`), an **Access** level and an **L4** checkbox.

| Access | Allows |
|---|---|
| `read-only` | `GET`, `HEAD`, `OPTIONS` |
| `read-write` (default) | Adds `POST`, `PUT`, `PATCH`, `DELETE` |
| `full` | Every method |
| **L4** checked | Pass-through with no HTTP inspection: no method control and no credential injection |

The section lists the endpoints that the selected providers already allow.

If the policy has a `credential_binding` for a provider you did not select, the dialog says
**This policy needs provider `<name>` attached** and shows the gateway's message below it.
Select **Attach `<name>` and create** to tick that provider and create again. If no provider
of that name exists in the workspace, create it on the **Providers** page first.

With the gateway default base, the WebUI creates the sandbox first, then adds your rules as a
new policy version. If that second step fails, you see a warning. Add the rules on the
sandbox's **Policy** tab.

> [!TIP]
> Not sure what the agent needs? Start with no rules, run it, then approve the proposals
> OpenShell drafts from denied traffic. See [Policies and proposals](policies-and-proposals.md).

#### Filesystem

By default the sandbox uses the policy shipped in its image, or else the gateway default:
`/bin`, `/usr`, `/lib`, `/proc`, `/dev/urandom`, `/etc` and `/var/log` read-only, `/tmp`,
`/dev/null` and the working directory read-write. Everything else is hidden. With **Copy
policy of**, it uses that sandbox's settings.

Select **Customize** to edit them, starting from those values:

| Field | What it does |
|---|---|
| **Read-only**, **Read-write** | One absolute path per line. Paths with `..` are refused |
| **Working directory read-write** | Adds the working directory to the read-write paths |
| **Landlock** | **Best effort** runs even where the kernel lacks Landlock; **Hard requirement** refuses to start there |

**Use the default** drops your changes. A custom filesystem sends the whole policy with the
create request, so the image's own policy is not used.

#### Process

The user and group the main process runs as. By default the runtime picks: the image's user,
or `sandbox`. **Customize** takes `sandbox` or a numeric ID; root (`0`) is refused.

### Runtime

| Field | What it does | Default |
|---|---|---|
| **Command** | Main process, with shell-style quoting, such as `python -m http.server 8080` | Empty keeps a login shell running |
| **Restart policy** | **Never**, **On failure** or **Always** | **Gateway default (never)** |
| **CPU limit** | CPU quantity, such as `500m` or `2` | No limit |
| **Memory limit** | Memory quantity, such as `512Mi` or `4Gi` | No limit |
| **Request GPUs** | Requests GPUs. Shown only when the gateway's driver supports GPUs | Off |
| **Count** | Number of GPUs. Shown when the driver supports a count | Empty means one |
| **Environment** | Key and value pairs. Do not put secrets here; use providers | none |
| **Labels** | Key and value pairs, such as `team` = `platform` | none |
| **Expose services** | HTTP ports to publish through the gateway once the sandbox is ready. See [Services](services.md) | none |

**CPU limit** and **Memory limit** are disabled when the gateway's compute driver does not
support them.

### With a template

When you pick a **Template**, the sandbox takes its workload from the template:

- **Image**, **CPU limit** and **Memory limit** are locked. **Image** shows "Set by the template."
- **Request GPUs** is hidden.
- **Environment** says "Set by the template; a sandbox created from a template cannot add its
  own." To add variables, create a template with them, or create the sandbox without one.
- Below **Template**, a summary shows what the template supplies, for example
  `ghcr.io/org/image:tag · cpu 2, memory 4Gi · env FEATURE_FLAG`.

Command, providers, network access, restart policy, labels and services stay per sandbox. See
[Templates](templates.md#create-a-sandbox-from-a-template).

### CLI equivalent

```bash
openshell sandbox create --name my-sandbox --from ghcr.io/org/image:tag \
  --cpu 2 --memory 4Gi --env DEBUG=1 --label team=platform \
  --provider my-provider --restart-policy on-failure -- python -m http.server 8080

openshell sandbox create --name my-sandbox --template python-dev --provider my-provider
```

## Start, stop and delete

| Action | Available when | What happens |
|---|---|---|
| **Start** | **Stopped**, **Completed** or **Error** | The sandbox starts again |
| **Stop** | **Ready**, **Starting** or **Provisioning** | Asks to confirm. The main process stops; the sandbox and its files are kept |
| **Delete** | Always | You type the sandbox name to confirm. Removes the sandbox, its files and its exposed services. You cannot undo this |

Use the buttons on the detail page header or the **⋯** menu in the list.

CLI equivalent: `openshell sandbox start`, `openshell sandbox stop`, `openshell sandbox delete`.

## Sandbox detail page

The header shows the name, phase, workspace and image, with **Terminal**, **Start** or
**Stop**, and **Delete** buttons. **Terminal** needs a ready sandbox.

| Tab | What it covers |
|---|---|
| **Overview** | Details, providers, services, conditions and containers. See below |
| **Policy** | Effective network rules, filesystem and process, settings. See [Policies and proposals](policies-and-proposals.md) |
| **Proposals** | Rules drafted from denied traffic. A badge counts pending ones. See [Policies and proposals](policies-and-proposals.md) |
| **Logs** | Live sandbox and gateway logs. See [Logs](logs.md) |
| **Terminal** | A shell or one-off command. See [Terminal and files](terminal-and-files.md) |
| **Files** | The sandbox file browser. See [Terminal and files](terminal-and-files.md#file-browser) |
| **History** | Policy versions, diffs and proposal activity. See [Policies and proposals](policies-and-proposals.md) |

## Overview tab

### Details

The **Details** card lists the sandbox **ID**, **Created**, **Image**, **Template** (when it
was created from one), **Command**, **Limits**, **GPU**, **Restart policy**, **Restarts**,
**Exit code**, **Process started**, **Policy version**, **Configuration**, **SSH host key**,
**Labels** and **Environment** (names only). Empty optional rows are hidden.

Two alerts can appear above it:

- **The supervisor did not accept the configuration**, with the error.
- **A token grant to <host>:<port> was refused**, with the provider and the failure code.

### Providers

The **Providers** card lists the attached providers and their readiness, such as **Ready**,
**Pending** or **Failed**.

- **Attach** opens a dialog. Pick a **Provider** that is not attached yet and click **Attach**.
  Its rules apply once the sandbox picks up the change.
- **Detach** asks to confirm. The sandbox loses the provider's credentials and network rules.

CLI equivalent: `openshell sandbox provider attach`, `openshell sandbox provider detach`.

### Services

The **Services** card lists the HTTP ports published for this sandbox, with their URLs.
**Expose** adds one. See [Services](services.md).

### Conditions and tool endpoints

**Conditions** lists the status conditions the gateway reports: type, status, reason, message
and when it changed. **Tool endpoints** appears when the policy has MCP endpoints and shows the
last observed result for each.

### Containers

For a local gateway, the **Containers** card shows live CPU, memory, network I/O and PIDs from
the local Docker engine for this sandbox. It needs the `docker` CLI on the machine that runs
the WebUI.

## Related

- [Templates](templates.md)
- [Terminal and files](terminal-and-files.md)
- [Services](services.md)
- [Policies and proposals](policies-and-proposals.md)
