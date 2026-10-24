# Policies and proposals

This page shows how to read and change a sandbox's policy, review the rules OpenShell drafts
from denied traffic, and browse policy history. It is for anyone who decides what a sandbox
may reach.

## How OpenShell policies work

A sandbox policy controls what a sandbox can access. OpenShell denies every outbound
connection unless a network rule allows it.

- A **network rule** names one or more endpoints (`host:port`) and the binaries that may reach
  them. A rule with no binaries applies to any binary.
- Filesystem, Landlock and process settings are fixed when the sandbox starts. Network rules
  can change while it runs, without a restart.
- Attached providers add their own rules. The **effective policy** is the sandbox's own
  policy plus those provider rules. It is what the sandbox enforces.

For the full model, see Sandbox Policies in the
[OpenShell documentation](https://docs.nvidia.com/openshell/latest/).

## The Policy tab

Open a sandbox and select **Policy**. The tab has these parts:

| Section | What it shows |
|---|---|
| **Network rules** | Every rule of the effective policy, with a version badge (`v3 loaded`) and the policy hash |
| **Filesystem and process** | Read-only and read-write paths, **Include workdir**, **Landlock**, **Run as user**, **Run as group**, **Middleware**. Fixed when the sandbox is created. |
| **Settings** | Effective runtime settings and where each value comes from |
| **Effective policy and settings as JSON** | The raw response, for copying or debugging |

The version badge shows the policy status: `loaded`, `pending`, `failed` or `superseded`. If
the sandbox reports a problem loading its policy, a red **The sandbox reported a policy
problem** alert shows the error.

CLI equivalent: `openshell policy get <sandbox> --full`.

### Reading the rules table

Each row is one rule. The **Endpoints** column shows each `host:port` with an access badge:

| Badge | Meaning |
|---|---|
| `read-only` | HTTP inspection on; GET, HEAD and OPTIONS only |
| `read-write` | Adds POST, PUT, PATCH and DELETE |
| `full` | Every HTTP method |
| `L4` | No HTTP inspection: any traffic to that endpoint, no method control, no credential injection |

Extra endpoint options appear as notes next to the badge, for example `path /v1`, `2 L7 allow
rules`, `TLS skip`, `audit only` or `credentials from <provider>`.

Rules with a **provider** badge come from attached providers. The gateway manages them, so you
cannot edit or remove them here. Detach the provider instead (see
[Providers and profiles](providers-and-profiles.md)).

If the table says **No network rules: all egress is denied.**, the sandbox cannot reach
anything except through its providers.

### Add rules

1. Select **Add rules**.
2. Fill one row per program and endpoint:
   - **Binary path**: an absolute path, for example `/usr/bin/curl`.
   - **Host and port**: `host:port`, for example `api.github.com:443`. Wildcards such as
     `*.example.com` are accepted.
   - **Access**: `read-only`, `read-write` (the default) or `full`.
   - **L4**: check it for pass-through with no HTTP inspection. **Access** is then ignored.
3. Select **Add rule** for more rows, then select **Add rules** to apply.

Rows for the same endpoint and access level become one rule named like
`allow_api_github_com_443`. The toast shows the new policy version. If the policy already
allows every row, you see **No change** instead.

> [!NOTE]
> One `host:port` can have only one access level. If the sandbox already has a rule for that
> endpoint with a different level, the dialog refuses and names the existing rule. Remove that
> rule first, or edit the policy as YAML.

The form covers simple rules only. For L7 rules, paths or TLS options, use **Edit YAML**.

CLI equivalent: `openshell policy update <sandbox> ...`.

### Remove a rule, endpoint or binary

- **Remove a rule**: open the row's menu and select **Remove rule**.
- **Remove an endpoint**: hover over it and select the **x** next to it. Shown only when the
  rule has more than one endpoint.
- **Remove a binary**: select the **x** on the binary chip. Shown only when the rule has more
  than one binary.

Each removal asks for confirmation and creates a new policy version. Traffic that only that
rule allowed is denied afterwards.

### Edit the whole policy as YAML

1. Select **Edit YAML**. The editor opens with the sandbox's own policy. Provider rules are
   left out, because the gateway adds them.
2. Edit the document. Select **Check** to parse it without applying. The result summarizes the
   rules and paths it found.
3. Select **Apply policy**. The whole sandbox policy is replaced.

The editor accepts three formats:

| Format | Example source |
|---|---|
| CLI YAML | A file you would pass to `openshell policy set --policy` (`filesystem_policy`, `access: read-write`, ...) |
| Proto-shaped YAML | The same structure as the gateway's protobuf messages |
| Proto JSON | JSON with the proto field names |

Only known spelling differences between the CLI format and the proto are converted. Unknown
fields are errors, and the gateway validates the result again. Filesystem, Landlock and
process sections are fixed after creation, so the gateway rejects changes to them.

CLI equivalent: `openshell policy set <sandbox> --policy <file>`.

### Change a setting

The **Settings** table lists each registered setting, its **Value** (or `default`) and
**From**, the scope it comes from. Sandbox values override the gateway's global values.

1. Select the pencil icon on a row.
2. Pick the **Type** (**Boolean**, **Integer** or **Text**). The gateway rejects a type the
   setting does not accept.
3. Enter the value and select **Save**.

To change a setting for every sandbox, use **Gateway** > **Settings** (see
[Workspaces and gateway](workspaces-and-gateway.md#global-settings)).

CLI equivalent: `openshell settings set <sandbox> --key <key> --value <value>`.

## Network rules when you create a sandbox

The **New sandbox** dialog has a **Network access** section with the same rule rows. Each row
lets one program reach one `host:port`; everything else is denied.

- **Start from** picks the base. **Gateway default (no network access)** starts from the
  gateway's default policy. **Copy policy of `<name>`** copies another sandbox's policy (without
  its provider rules). Rules the form cannot show are kept as they are.
- **Edit as YAML** switches to a YAML editor. **Back to the form** discards YAML changes.
- **Load file** puts a policy file from your computer into the YAML editor, the same as
  pasting it.
- Endpoints that selected providers add on their own are listed under the rows, so you do not
  need rules for them.

With the gateway default as the base, the WebUI creates the sandbox first, then merges your
rows into its default policy. The default policy keeps its filesystem and process sections.
If that merge fails, you see a warning that the sandbox was created without its rules. Add
them on the **Policy** tab.

> [!TIP]
> Not sure what an agent needs? Create the sandbox with no rules, run the agent, then approve
> the proposals OpenShell drafts from the denied traffic.

See [Sandboxes](sandboxes.md) for the rest of the dialog.

## The Proposals tab

When a sandbox is denied network access, OpenShell drafts a rule that would allow it. An
agent in the sandbox can also submit proposals when the policy advisor is on (setting
`agent_policy_proposals_enabled`). Proposals wait on the **Proposals** tab until you decide.
The tab label shows the number of pending proposals.

A proposal never changes the policy on its own. Approving one adds its rule, and the sandbox
loads it without a restart. The denied request stays denied, so the agent must retry it.

### Review a proposal

Filter with **Pending**, **Approved**, **Rejected** or **All**. Each card shows:

- The rule name and status. A `refined` badge marks a proposal that replaces an earlier one
  after OpenShell observed more of the HTTP traffic.
- Confidence, how often the traffic was seen, and when.
- The endpoints and binaries the rule would allow.
- The rationale, and **security notes** in amber when OpenShell flags a risk.
- **Preview the policy change**: a diff of the effective policy before and after approval.

| Action | Where | What it does | CLI equivalent |
|---|---|---|---|
| **Approve** | Pending card | Merges the rule into the policy (new version) | `openshell rule approve <sandbox> --chunk-id <id>` |
| **Reject** | Pending card | Asks for an optional **Reason**, passed to the agent so it can revise the proposal | `openshell rule reject <sandbox> --chunk-id <id>` |
| **Edit** | Pending card | Opens the rule as YAML so you can narrow it; it stays pending | none |
| **Undo** | Approved card | Removes the approved rule again (new version) | none |
| **Approve all** | Toolbar | Approves every pending proposal without security notes in one new version | `openshell rule approve-all <sandbox>` |
| **Clear** | Toolbar | Removes all pending proposals; new denials can create new ones | `openshell rule clear <sandbox>` |

> [!WARNING]
> **Approve all** skips proposals with security notes. Review those one by one.

When you **Edit** a proposal, keep exactly one rule under `network_policies`. Only its
endpoints and binaries matter. Use it to remove binaries, methods or paths before approving.

## The History tab

**Policy revisions** lists every policy version of the sandbox with **Version**, **Status**,
**Hash**, **Created**, **Loaded** and **Error**.

1. Select a row. The newest version is selected by default.
2. **View** shows that version as YAML.
3. **Compare** shows a diff against another version. Pick it from the **with vN** menu; the
   previous version is the default.

Provider rules are left out of both views.

**Proposal activity** below lists denials, analysis runs and review decisions for the
sandbox's proposals, newest first.

CLI equivalent: `openshell policy list <sandbox>`, `openshell policy get <sandbox> --rev <N>`
and `openshell rule history <sandbox>`.

## Related

- [Logs](logs.md): find the denied connections behind a proposal
- [Sandboxes](sandboxes.md)
- [Providers and profiles](providers-and-profiles.md)
- [Concepts](concepts.md)
