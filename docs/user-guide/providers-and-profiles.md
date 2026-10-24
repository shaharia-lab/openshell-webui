# Providers and profiles

This page shows how to manage providers (the credentials sandboxes use) and provider profiles
(the provider types behind them). It is for anyone who gives sandboxes access to an API
without handing them the secret.

## How providers work

- A **provider profile** defines a provider type: which credentials it holds, how they are
  sent (for example as a header), and which endpoints and binaries it allows.
- A **provider** is one named set of credential values of that type, stored in the gateway.
- When you attach a provider to a sandbox, the sandbox sees placeholders, not the secrets. The
  sandbox proxy puts the real value into requests to the profile's endpoints. The provider
  also adds its own network rules (`_provider_*`) to the sandbox's effective policy.

For details, see Providers and Provider Profiles in the
[OpenShell documentation](https://docs.nvidia.com/openshell/latest/).

## The Providers page

**Providers** lists the providers in the selected workspace:

| Column | Shows |
|---|---|
| **Name** | The provider name |
| **Type** | Its profile ID |
| **Refresh** | How automatic credential refresh is doing (see below), or `—` when nothing refreshes |
| **Workspace** | Only in the **All workspaces** view |
| **Credentials** | Credential key names, never values |
| **Config** | Non-secret settings as `key=value` |
| **Expires** | The soonest credential expiry, or `never` |

Each row's menu has **Update credentials**, **Credential refresh** and **Delete**.

The **Refresh** badge shows the worst credential of the provider. Select it to open
**Credential refresh**.

| Badge | Meaning |
|---|---|
| **Refreshed** (green) | The last refresh worked |
| **Configured**, **Refreshing** | Set up but not refreshed yet, or a refresh is running |
| **Failing, retrying** (amber) | The last refresh failed; the gateway retries on its own |
| **Needs reauthorization**, **Needs configuration**, **Failing**, **Expired** (red) | The gateway cannot renew the credential without you. Sandboxes that use it lose access to its service until you fix it |

> [!NOTE]
> Secret values never reach the browser. After you save a credential, the WebUI cannot show
> it again. Where a secret field appears in a response, it reads `[redacted]`.

### Create a provider

You need at least one provider profile first. Select one workspace; **New provider** is
disabled in the **All workspaces** view.

1. Select **New provider**.
2. Enter a **Name** and pick a **Type (profile)**. The dialog lists the credentials that
   profile expects; required ones have a red asterisk.
3. Enter each secret. If a credential can use several environment variables, pick one in the
   menu next to it.
4. Optional: add **Other credentials** (extra secret environment variables, if the profile
   allows them) and **Config** values, such as a base URL or region.
5. Select **Create provider**.

CLI equivalent: `openshell provider create --name <name> --type <profile> --credential ...`.

### Update credentials

**Update credentials** opens a form with each existing credential key.

| Field | Effect |
|---|---|
| Secret (shows `unchanged`) | Leave empty to keep the stored value; type a new value to replace it |
| **Expires** | Set or change when the current value stops working; clear it to remove the expiry |
| **Remove** | Deletes that credential |
| **Add credentials** | Adds new keys. A key that already exists must be changed above. |
| **Config** | Edit values; removing a row deletes that key |

Select **Update provider**. Sandboxes that use the provider get the change without a restart.
The toast says how many sandboxes received it.

CLI equivalent: `openshell provider update <name> ...`, with `--credential-expires-at` for
expiry.

### Credential refresh and rotation

**Credential refresh** opens a side panel that shows how the gateway renews each credential.
For each refreshing credential you see its status, **Strategy**, **Expires**, **Next
refresh**, **Last refresh**, and any **Last error**, **Failure** or **Recovery** hint.

| Action | What it does | CLI equivalent |
|---|---|---|
| **Rotate now** | Asks the gateway to mint a new value right away | `openshell provider refresh rotate` |
| **Configure refresh** (or the gear icon) | Sets the **Strategy**, **Material** and optional expiry of the current value | `openshell provider refresh configure` |
| Trash icon | Stops refreshing: deletes the refresh material; the current value stays until it expires | `openshell provider refresh delete` |

Strategies offered: **OAuth2 refresh token**, **OAuth2 client credentials**, **Google service
account JWT**, **AWS STS assume role**, **External updater** and **Static (no refresh)**.
Material names depend on the strategy and profile, for example `refresh_token`, `client_id`
or `role_arn`. Material values are stored as secrets.

If no credential refreshes, the panel says so. Static credentials stay as entered until you
update them.

### Delete a provider

Select **Delete** and type the provider name to confirm. Sandboxes that use it lose its
credentials and network rules. You cannot undo this.

## Providers on a sandbox

### Attach at creation

The **New sandbox** dialog has a **Providers** section: search the workspace's providers by
name or type and tick the ones to attach. Endpoints the selected providers allow are listed under **Network access**, so you
need no rules for them. See [Sandboxes](sandboxes.md).

### Attach, detach and readiness

On a sandbox's **Overview** tab, the **Providers** section lists attached providers.

- **Attach**: pick a provider that is not attached yet, then select **Attach**. Its rules
  apply once the sandbox picks up the change.
- **Detach**: confirm, and the sandbox loses the provider's credentials and network rules.

Each attached provider shows its readiness: whether the sandbox has installed the provider's
credentials and policy. `Ready` means it is installed. `Persisted` and `Pending` mean the
gateway stored the change and the sandbox has not finished applying it. `Withheld` and
`Failed` need attention; the reason or error shows next to the badge. `Superseded` and
`Revoked` are past states. If readiness cannot be read, you see **Readiness unavailable** with
the error.

CLI equivalent: `openshell sandbox provider attach <sandbox> <provider>` and
`openshell sandbox provider detach <sandbox> <provider>`.

## The Provider profiles page

**Provider profiles** lists every profile you can use in the selected workspace: built-in
platform profiles and custom ones. Columns show the **Profile** (an `inference` badge marks
profiles usable for inference), **Category**, **Credentials** (environment variables, auth
style, header, refresh strategy), **Endpoints**, **Binaries** and **Source**.

Select a row, or **View** in its menu, to see the profile as YAML.

Custom profiles belong to one workspace, or to the platform (every workspace). The
**Source** column shows `user · workspace` or `user · platform`. In the **All workspaces** view the page shows **Pick a
workspace** instead of a list, because the gateway does not list profiles across workspaces.

### Import a profile

1. Select one workspace, then **Import profile**.
2. Pick the **Scope**: **Workspace `<name>`** (the default) or **Platform: every workspace**.
3. Paste the profile. The editor shows an example as a placeholder.
4. Select **Check** to have the gateway lint it without saving. Errors and warnings show
   with the field they refer to.
5. Select **Import**.

The profile is added to the selected workspace, or to the platform.

Only platform admins can import, edit or delete platform profiles; the gateway decides. If
you are not one, the dialog says **Only a platform admin can change platform profiles** above
the gateway's message. Import into a workspace instead, or ask an admin.

| Format | Example source |
|---|---|
| CLI YAML | A file you would pass to `openshell profile import -f` |
| Proto-shaped YAML | The gateway's protobuf field names |
| Proto JSON | JSON with the proto field names |

Only known spelling differences are converted, such as `category: other`. Unknown fields are
errors.

CLI equivalent: `openshell profile lint -f <file>` and `openshell profile import -f <file>`
(add `--global` for platform scope).

### Edit or delete a profile

Only custom profiles (source `user`) can be edited or deleted.

- **Edit** opens the profile as YAML. Select **Save profile**. Changes apply to providers of
  this type. If someone changed the profile in the meantime, the gateway rejects the update;
  reopen it and try again.
- **Delete** removes the profile. Providers of that type can no longer be created. The gateway
  refuses while providers still use it.

CLI equivalent: `openshell profile delete <id>`.

## Related

- [Policies and proposals](policies-and-proposals.md)
- [Sandboxes](sandboxes.md)
- [Concepts](concepts.md)
- [Security](security.md)
