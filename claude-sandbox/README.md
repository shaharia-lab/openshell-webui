# Claude Code sandbox (OpenShell)

An example sandbox that runs Claude Code under an OpenShell policy.

Files:
- `Dockerfile`: Ubuntu 24.04 + native Claude Code at `/usr/local/bin/claude`.
- `policy.yaml`: default filesystem policy + egress only for `claude` to
  `api.anthropic.com` and `statsig.anthropic.com`. All other egress is denied.
- `claude-code-oauth.yaml`: provider profile that injects a Claude OAuth token.

Create it from the published image (`linux/amd64` and `linux/arm64`):

    openshell sandbox create --name claude-sandbox --from ghcr.io/shaharia-lab/claude-sandbox:latest \
      --policy policy.yaml --provider claude-oauth --detach --no-auto-providers

The image is rebuilt and pushed whenever this folder changes on `main`, tagged `latest`
and `sha-<commit>`. It does not follow WebUI releases. To build it yourself instead:

    docker build -t claude-sandbox:local .
    # then pass `--from claude-sandbox:local` to the create command above

Auth uses a subscription OAuth token from `claude setup-token`, exported in your
shell as `CLAUDE_CODE_OAUTH_TOKEN`. The sandbox only sees a placeholder; the proxy
injects `Authorization: Bearer <token>` for `claude` -> api.anthropic.com:

    openshell provider profile import -f claude-code-oauth.yaml
    openshell provider create --name claude-oauth --type claude-code-oauth --credential CLAUDE_CODE_OAUTH_TOKEN
    # then add `--provider claude-oauth` to the create command above

Policy endpoints must be L7 (`protocol: rest`). An L4-only rule makes the
gateway reject credential injection.

Use:

    openshell sandbox connect claude-sandbox          # shell, then run `claude`
    openshell sandbox exec claude-sandbox -- claude -p 'reply with OK'
    openshell logs claude-sandbox                     # ALLOWED / DENIED egress events

If Docker runs inside a VM (Lima, Colima, Docker Desktop) and sandboxes cannot
reach the gateway, check the Docker driver's network settings in the gateway's
`gateway.toml` (bridge mode and the `host.docker.internal` mapping).
