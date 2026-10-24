# Services

This page shows you how to publish an HTTP port of a sandbox through the gateway, and how to
remove it. It is for anyone who runs a dev server, notebook, dashboard or API inside a sandbox
and wants to open it in a browser.

## How services work

A service makes a process that listens on loopback inside a sandbox reachable through a
gateway URL. The gateway routes requests to that port while the sandbox is ready.

- Run the server on `127.0.0.1` inside the sandbox, for example
  `python -m http.server 8080 --bind 127.0.0.1`.
- Each sandbox can have one unnamed service and any number of named ones.
- A local gateway returns `openshell.localhost` URLs, such as
  `http://my-sandbox--web.openshell.localhost:<port>/`. A remote gateway returns HTTPS URLs on
  its listener.

> [!WARNING]
> Service routes do not use OIDC or CLI login. The application in the sandbox is responsible for
> its own authentication. See the upstream
> [Expose long running services](https://docs.nvidia.com/openshell/latest/how-it-works/sandboxes/overview#expose-long-running-services)
> section.

## Services page

Open **Services** in the sidebar. The table lists the exposed services in the selected workspace.

| Column | Shows |
|---|---|
| **Service** | The service name, or **(unnamed)** |
| **Sandbox** | Click to open the sandbox |
| **Workspace** | Only with **All workspaces** |
| **Port** | The port inside the sandbox |
| **URL** | Opens in a new tab. The copy icon copies it |
| **Authorization** | **Strip** or **Bearer passthrough** |

Type in **Filter services** to filter the list.

CLI equivalent: `openshell service list`.

## Expose a service when you create a sandbox

1. In the **New sandbox** dialog, under **Runtime**, expand **Expose services**.
2. Click **Expose a port**.
3. Fill in the row:
   - **Service name**: optional, such as `web`. Empty is the unnamed service.
   - **Port**: `1` to `65535`, such as `8080`.
   - **Authorization**: see [Authorization modes](#authorization-modes).
4. Set **Command** to start the server, for example `python -m http.server 8080 --bind 127.0.0.1`.
5. Click **Create sandbox**.

The gateway publishes the services once the sandbox is ready. Each service name can appear only
once.

CLI equivalent:

```bash
openshell sandbox create --name my-sandbox --expose 8080 --detach \
  -- python -m http.server 8080 --bind 127.0.0.1
```

## Expose a service later

From the **Services** page:

1. Click **Expose service**.
2. Pick the **Sandbox**.
3. Fill in the fields below and click **Expose**.

From a sandbox's **Overview** tab:

1. In the **Services** card, click **Expose**.
2. Fill in the fields below and click **Expose**.

| Field | What it does | Default |
|---|---|---|
| **Service name** | Optional name. Empty is the sandbox's unnamed service | Empty |
| **Port** | The loopback port inside the sandbox | none |
| **Authorization header** | What the gateway does with the caller's `Authorization` header | **Strip Authorization header** |

After you click **Expose**, a notification shows the service URL.

CLI equivalent: `openshell service expose my-sandbox 8080 web`.

## Authorization modes

| Mode in the WebUI | CLI value | What happens |
|---|---|---|
| **Strip Authorization header** | default | The gateway removes the incoming `Authorization` header before the request reaches the sandbox |
| **Pass bearer token through** | `bearer-passthrough` | The gateway forwards one valid `Bearer` credential unchanged. Use it when the application does its own authentication |

With bearer passthrough, a missing credential reaches the application so it can respond itself.
Duplicate, Basic and malformed credentials fail with `400 Bad Request`.

> [!WARNING]
> Bearer passthrough delivers the caller's credential to the sandbox service. Use it only when
> you trust that service with the credential.

CLI equivalent: `openshell service expose my-sandbox 4500 --authorization-mode bearer-passthrough`.

## Remove a service

1. Click the trash icon on the service's row, on the **Services** page or in the sandbox's
   **Services** card.
2. Confirm **Delete service**.

The URL stops working. The process in the sandbox keeps running. Deleting a sandbox also removes
its services.

CLI equivalent: `openshell service delete my-sandbox web` (omit the name for the unnamed service).

## Related

- [Sandboxes](sandboxes.md)
- [Concepts](concepts.md)
- [Security](security.md)
