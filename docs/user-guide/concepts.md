# Concepts

This page explains the OpenShell concepts you meet in the WebUI, in plain words, and shows
where each one lives. It is for new OpenShell users and for CLI users who want to map what they
know to the UI.

For the full upstream explanation, see the
[OpenShell documentation](https://docs.nvidia.com/openshell/latest/).

## At a glance

| Concept | What it is | Where in the WebUI | CLI equivalent |
|---|---|---|---|
| Gateway | The control plane that runs and manages sandboxes | Sidebar gateway menu, **Gateway** page, **Overview** | `openshell gateway list`, `openshell status` |
| Workspace | An access and resource boundary inside a gateway | Top bar workspace selector, **Workspaces** page | `--workspace`, `openshell workspace list` |
| Sandbox | An isolated environment where an agent runs | **Sandboxes** page and sandbox detail page | `openshell sandbox list`, `openshell sandbox create` |
| Policy | What a sandbox may reach on the network and the file system | Sandbox **Policy** tab | `openshell policy get`, `openshell policy set` |
| Proposal | A network rule drafted from denied traffic, waiting for review | Sandbox **Proposals** tab | `openshell rule get`, `openshell rule approve` |
| Provider | A stored credential set that sandboxes can use without seeing it | **Providers** page, sandbox **Overview** tab | `openshell provider create`, `openshell sandbox provider attach` |
| Provider profile | The definition of a provider type: credentials, endpoints, binaries | **Provider profiles** page | `openshell profile list`, `openshell profile import` |
| Template | A reusable workload: image, resources, environment, driver settings | **Templates** page, **New sandbox** dialog | `openshell sandbox template create` |
| Service | An HTTP port inside a sandbox, published through the gateway | **Services** page, sandbox **Overview** tab | `openshell service expose` |
| Compute driver | The runtime that creates sandbox workloads (Docker, Podman, Kubernetes, VM) | **Gateway** page, **Compute drivers** | `openshell gateway info` |

## Gateway

The gateway is the OpenShell control plane. It creates and deletes sandboxes, stores provider
credentials, delivers policies, and checks who you are. The CLI registers gateways in its
registry, and the WebUI reads that same registry.

The WebUI talks to one selected gateway at a time. The **Overview** page lists every registered
gateway with its health. See [Workspaces and gateway](workspaces-and-gateway.md).

## Workspace

A workspace is an isolation boundary inside a gateway. Sandboxes, templates, providers,
provider profiles, services, policies and settings belong to one workspace. Members of other
workspaces cannot see them. Every gateway has a `default` workspace.

OpenShell combines an identity-provider role with a membership per workspace:

| Role | Can do |
|---|---|
| Platform admin | Manage every workspace and platform-wide configuration |
| Workspace admin (**Admin** member) | Manage providers, profiles, templates, policies, settings and members in that workspace |
| Workspace user (**User** member) | Create and use sandboxes and services, read providers and templates |

The gateway enforces these roles, not the WebUI. Your roles show in the sidebar footer and on
the **Gateway** page under **Your identity**.

## Sandbox

A sandbox is a private execution environment for an agent. It runs a container (or VM, or pod)
with no network access except what its policy and providers allow.

A sandbox moves through phases. The WebUI shows the phase as a badge:

| Phase | Meaning |
|---|---|
| **Provisioning**, **Starting** | The gateway is creating or starting the workload |
| **Ready** | Running. Terminal and file browser work only in this phase |
| **Stopping**, **Deleting** | A stop or delete is in progress |
| **Stopped** | The main process is stopped. The sandbox is kept, and you can start it again |
| **Completed** | The main process exited with code 0 |
| **Error** | The main process failed, or the sandbox could not start |
| **Unknown** | The gateway reported no phase |

See [Sandboxes](sandboxes.md).

## Policy

A policy controls what a sandbox can access. OpenShell denies everything the policy does not
allow. The WebUI shows three parts on the sandbox **Policy** tab:

- **Network rules**: each rule lets a program (an absolute binary path such as
  `/usr/bin/curl`) reach a `host:port`. HTTP rules can limit methods: `read-only`,
  `read-write` or `full`. An `L4` rule passes traffic through without HTTP inspection.
  Network rules can change while the sandbox runs.
- **Filesystem and process**: read-only and read-write paths, Landlock, and the user and group
  that processes run as. These are fixed when the sandbox is created.
- **Settings**: runtime settings. A sandbox value overrides the gateway's global value.

Attached providers add their own network rules to the effective policy. Every policy change
creates a new version, listed on the **History** tab. See
[Policies and proposals](policies-and-proposals.md).

## Proposals

When a sandbox is denied network access, OpenShell can draft a rule that would allow it. These
drafts are proposals. A proposal never changes the policy by itself: you approve, edit or reject
it. See [Policies and proposals](policies-and-proposals.md).

## Providers and provider profiles

A provider holds credentials, such as an API key or a GitHub token. When you attach a provider
to a sandbox, the sandbox gets placeholders, not the secret values. OpenShell injects the real
credential only into requests bound for the provider's endpoints.

A provider profile defines a provider type: which credentials it needs, which endpoints and
binaries it allows, and how its tokens refresh. You create providers from profiles. See
[Providers and profiles](providers-and-profiles.md).

## Templates

A template is a reusable workload shape for a workspace: image, CPU, memory, GPUs, environment
variables and driver-specific settings. A sandbox created from a template takes the whole
workload from it. See [Templates](templates.md).

## Services

A service publishes an HTTP port that listens on loopback inside a sandbox, so you can open a
dev server, notebook or dashboard through a gateway URL. See [Services](services.md).

## Compute drivers

A compute driver is how the gateway creates sandbox workloads: Docker, Podman, Kubernetes or
VM. Every driver exposes the same gateway API, but capabilities differ. For example, a driver
may not support CPU limits or GPU selection. The **New sandbox** dialog disables the fields the
gateway's driver does not support. The **Gateway** page lists the drivers and what they support.

## Related

- [Getting started](getting-started.md)
- [Navigating the WebUI](navigation.md)
- [Sandboxes](sandboxes.md)
- [Workspaces and gateway](workspaces-and-gateway.md)
