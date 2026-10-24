# Workspaces and gateway

This page covers workspaces (create, delete, members and roles), the **All workspaces** view,
and the **Gateway** page. It is for people who administer a gateway or need to know who they
are on it.

## Workspaces

A workspace is an isolation boundary inside a gateway. Sandboxes, providers, templates and
services belong to one workspace. Every gateway has a `default` workspace.

Pick the workspace in the top bar. Every page then shows that workspace only.

### The All workspaces view

Select **All workspaces** at the bottom of the workspace menu to list resources across every
workspace you can access.

- Lists such as **Sandboxes** and **Providers** gain a **Workspace** column.
- **Provider profiles** are per workspace, so that page asks you to pick one.
- Creating needs one workspace. **New provider**, **Import profile** and new templates are
  disabled with a hint. **New sandbox** asks you to pick a **Workspace**.
- The gateway allows this view only for platform admins. Other users get a permission error
  from the gateway.

CLI equivalent: `--all-workspaces` on list commands.

### Roles

The gateway, not the WebUI, enforces roles. The WebUI acts as the identity in your CLI
credentials and can do only what that identity may do.

| Role | Comes from | Can |
|---|---|---|
| Platform admin | The OIDC admin role | Everything, in every workspace, without being a member |
| Workspace admin | An `Admin` membership | Manage providers, profiles, policies, settings and members of that workspace |
| Workspace user | A `User` membership | Create and use sandboxes and services, read providers |

> [!NOTE]
> A local gateway without OIDC role configuration treats every authenticated user as a
> platform admin.

See Workspaces in the [OpenShell documentation](https://docs.nvidia.com/openshell/latest/)
for the full permission table.

### Create a workspace

1. Go to **Workspaces** and select **New workspace**.
2. Enter a **Name**, for example `team-a`, and optional **Labels**.
3. Select **Create workspace**.

On gateways with OIDC, this needs the platform admin role.

CLI equivalent: `openshell workspace create --name <name>`.

### Delete a workspace

Open the workspace's menu, select **Delete** and type its name to confirm. The `default`
workspace cannot be deleted. The gateway refuses while the workspace still has sandboxes,
providers or other resources. You cannot undo this.

CLI equivalent: `openshell workspace delete <name>`.

**Switch to it** in the same menu makes that workspace the current one.

### Manage members

Select a workspace row. **Members of `<name>`** below lists each **Subject**, **Role** and
when it was **Added**.

- **Add member**: enter the **Principal subject** and pick a **Role** (**User** or **Admin**).
  The subject is the OIDC subject or mTLS identity shown under **Your identity** on the
  **Gateway** page.
- **Change role**: the gateway has no role update, so the WebUI removes the membership and adds
  it again with the new role. If the new one is refused, it restores the old one.
- **Remove**: the member loses access to the workspace.

Only a platform admin can grant the `Admin` role. Platform admins can use every workspace
without being listed.

CLI equivalent: `openshell workspace member add|remove|list`.

## The Gateway page

**Gateway** (under **Administration**) shows the gateway selected in the top bar. Its tabs are
**Overview**, **Settings**, **Service log** and **Audit log**.

### Overview

| Section | Shows |
|---|---|
| **Connection** | **Endpoint**, **Auth mode** (`mtls`, `oidc` or `plaintext`), **Location** (**This machine** or **Remote**), **OIDC issuer**, **Active in CLI**, **Health** and **Version** |
| **Your identity** | Who the gateway thinks you are: **Subject**, **Name**, **Identity provider**, **Roles** and **Scopes** |
| **Compute drivers** | Each **Driver**, its **Version**, and what it **Supports** (CPU limits, memory limits, GPUs) |
| **Extensions** | Extensions negotiated at gateway startup, with **Kind**, **Version** and **Capabilities** |

**Gateway info as JSON** at the bottom shows the raw response.

CLI equivalent: `openshell status` and `openshell gateway info`.

### Global settings

**Settings** lists gateway-wide runtime settings. They apply to every sandbox unless the
sandbox sets its own value.

- Select the pencil icon, pick the **Type** (**Boolean**, **Integer** or **Text**), enter the
  value and select **Save**.
- Select the trash icon to clear a value. The setting returns to its default for every sandbox
  that does not set it.

Changing global settings needs the platform admin role. To set a value for one sandbox, use
its **Policy** tab (see [Policies and proposals](policies-and-proposals.md#change-a-setting)).

CLI equivalent: `openshell settings set --global --key <key> --value <value>` and
`openshell settings delete --global --key <key>`.

### Service log

The local gateway's own log, for gateways on this machine only. See
[Logs](logs.md#gateway-service-log).

### Audit log

**Audit log** lists the last 500 write actions made through this WebUI, newest first: **Time**,
**Gateway**, **Workspace**, **Action** (the gateway method), **Target** and **Result**. Failed
actions show the error. Use **Filter actions** to search.

The log covers every gateway, not just the selected one. It records what was acted on, never
credentials or request bodies. The file path shows at the right of the toolbar. See
[Security](security.md#audit-log) and [Configuration](configuration.md).

> [!NOTE]
> The audit log only records actions taken through this WebUI. Changes made with the CLI or
> by other clients do not appear here.

## Related

- [Concepts](concepts.md)
- [Logs](logs.md)
- [Security](security.md)
- [Configuration](configuration.md)
