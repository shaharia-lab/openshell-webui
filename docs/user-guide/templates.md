# Templates

This page explains sandbox templates and how to create, delete and use them in the WebUI. It is
for workspace admins who define standard workloads, and for users who create sandboxes from them.

## What a template is

A template (in OpenShell, a sandbox workload template) is a reusable workload shape for a
workspace. It stores:

- the image,
- CPU, memory and GPU requests,
- environment variables,
- driver-specific configuration.

When you create a sandbox from a template, the sandbox takes the whole workload from it. Each
sandbox still has its own providers, policy and labels, so each keeps its own access boundary.

Templates belong to one workspace. Creating and deleting them needs the workspace admin role
(or platform admin); workspace users can list and use them. See the upstream
[Templates](https://docs.nvidia.com/openshell/latest/how-it-works/sandboxes/templates) page.

## Template list

Open **Templates** in the sidebar.

| Column | Shows |
|---|---|
| **Name** | Template name |
| **Workspace** | Only with **All workspaces** |
| **Image** | The image name and tag, or `default` for the gateway's default. Hover for the full reference; click to copy it |
| **Resources** | For example `cpu 2, memory 4Gi, gpu 1`, or `—` |
| **Environment** | Variable names (values are not shown). Past four, **+N more** lists the rest on hover |
| **Labels** | `key=value` labels |
| **Created** | Age |

Type in **Filter templates** to search the list. Columns that do not fit hide on narrow
screens. **Templates as JSON** below the table shows the raw data.

CLI equivalent: `openshell sandbox template list`.

## Create a template

1. Select one workspace in the top bar. **New template** is disabled with **All workspaces**.
2. On the **Templates** page, click **New template**.
3. Fill in the fields below. Only **Name** is required.
4. Click **Create template**.

| Field | What it does | Example | When empty |
|---|---|---|---|
| **Name** | Template name. Starts with a letter or digit; letters, digits, `.`, `_`, `-`; up to 63 characters | `python-dev` | Required |
| **Image** | OCI image reference | `ghcr.io/org/image:tag` | The gateway's default image |
| **CPU** | CPU quantity | `2` or `500m` | No CPU request |
| **Memory** | Memory quantity | `4Gi` or `512Mi` | No memory request |
| **Request GPUs** | Requests GPUs. Tick it and leave **Count** empty for the compute driver's default assignment, or enter a number | `1` | No GPUs |
| **Environment** | Key and value pairs. No secrets; use providers | `CLAUDE_CODE_DISABLE_MOUSE` = `1` | No variables |
| **Labels** | Key and value pairs on the template | `team` = `runtime` | No labels |
| **Driver config** | JSON object keyed by compute driver name, passed to the driver as is | `{"kubernetes": {"pod": {"runtime_class_name": "kata-containers"}}}` | No driver config |

The gateway uses only the **Driver config** block for its own compute driver. The **Gateway**
page lists the drivers. See [Concepts](concepts.md#compute-drivers).

CLI equivalent:

```bash
openshell sandbox template create python-dev \
  --image ghcr.io/org/image:tag \
  --cpu 2 --memory 4Gi --gpu 1 \
  --env FEATURE_FLAG=on --label team=runtime \
  --driver-config-json '{"kubernetes":{"pod":{"runtime_class_name":"kata-containers"}}}'
```

## Delete a template

1. Click the trash icon on the template's row.
2. Confirm **Delete template**.

Existing sandboxes keep running. New sandboxes cannot use the template.

CLI equivalent: `openshell sandbox template delete python-dev`.

## Create a sandbox from a template

1. Click **New sandbox**.
2. Pick the template in **Template**. The list shows the templates of the sandbox's workspace.
3. Read the summary under **Template**. It shows the image, resources and environment variable
   names that the template supplies.
4. Fill in the per-sandbox fields: **Name**, **Providers**, the **Policy** sections, and under
   **Runtime** **Command and restart**, **Labels** and **Expose services**.
5. Click **Create sandbox**.

The sandbox's **Overview** tab shows the template name under **Details**.

CLI equivalent: `openshell sandbox create --name my-sandbox --template python-dev --provider my-provider`.

## The workload comes from the template

With a template, the gateway takes the workload only from the template and rejects workload
fields on the create request. The WebUI therefore locks those fields and sends only the
per-sandbox ones.

| From the template | Per sandbox |
|---|---|
| Image | Name and workspace |
| CPU and memory | Command |
| GPUs | Providers |
| Environment variables | Network access (policy) |
| Driver config | Restart policy |
| | Labels |
| | Exposed services |

> [!NOTE]
> A sandbox created from a template cannot add its own environment variables. To add some,
> create a template that has them, or create the sandbox without a template. The CLI behaves the
> same: `--template` cannot be combined with `--env`, `--from`, `--cpu`, `--memory`, `--gpu` or
> `--driver-config-json`.

When you pick a template in the dialog, the WebUI clears any image, CPU, memory, GPU and
environment values you had entered. Pick **None** to edit them again.

## Related

- [Sandboxes](sandboxes.md)
- [Concepts](concepts.md)
- [Terminal and files](terminal-and-files.md)
- [Workspaces and gateway](workspaces-and-gateway.md)
