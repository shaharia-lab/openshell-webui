# Security

This page explains the security invariants every change must keep, where the code enforces each one, the threats they address, and a checklist for reviewing a change.

The WebUI holds the keys to your gateways and has no login. Anyone who can send it requests acts as your gateway identity. Its defenses therefore focus on who can reach it and what a request can do.

## Invariants and where they live

| Invariant | Enforced in |
|---|---|
| Every gateway message sent to the browser is redacted | `ProtoJson` in `backend/src/http/proto_json.rs` calls `redact::redact` (`backend/src/redact.rs`) |
| Requests that echo `[redacted]` back are refused | `redact::has_mask`, checked in `call` in `backend/src/http/calls.rs` |
| The browser reaches only allowlisted methods | `ALLOWED` and `lookup` in `backend/src/rpcs.rs`; `call` returns 404 otherwise |
| Sandbox-token, supervisor, peer and credential-export RPCs are never allowlisted | Review rule; `sensitive_methods_are_not_allowlisted` in `rpcs.rs` covers part of it |
| Every non-GET request and WebSocket upgrade passes Origin and CSRF checks | `check` in `backend/src/http/guard.rs`, applied to the whole router in `backend/src/http/mod.rs` |
| Writes respect `--read-only` | `call` (for `Write` methods), `exec` in `http/terminal.rs`, `write_op` in `http/files.rs` |
| Writes are audited without credentials or bodies | `AuditLog` and `target` in `backend/src/audit.rs` |
| Loopback by default; unknown `Host` headers are rejected | `--addr` default in `backend/src/config.rs`; `allowed_hosts` in `backend/src/state.rs`; `check` in `guard.rs` |
| `script-src 'self'`, no third-party CDNs or fonts | `CSP` in `backend/src/http/mod.rs`; `frontend/public/theme-init.js`; `@fontsource-variable/geist` |
| No `unsafe` code | `unsafe_code = "forbid"` in `backend/Cargo.toml` |

## Request guards

`guard` in `backend/src/http/guard.rs` runs before every route, in this order:

1. **Host allowlist.** `Host` must be the listen address, `127.0.0.1:<port>`, `localhost:<port>`, `[::1]:<port>`, or a value from `--allowed-host`. Otherwise 421.
2. **Cross-site refusal.** For `/api/*`, `Sec-Fetch-Site` must be empty, `same-origin` or `none`. Otherwise 403. Pages themselves may still be opened from links.
3. **Origin and CSRF.** For any method other than GET and HEAD, and for any WebSocket upgrade:
   - `Origin` must equal `http://<Host>`.
   - The CSRF token must match: the `X-CSRF-Token` header, or the `csrf` query parameter for WebSocket upgrades. The comparison is constant-time (`subtle`).

The CSRF token is 32 random bytes made at startup (`state::random_token`). The browser gets it from `GET /api/session`, which the cross-site check protects.

## Other hardening

- Response headers on every route: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, the CSP, and `Cache-Control: no-store` unless a route sets its own.
- CSP: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`.
- Request bodies are limited to 4 MiB, file uploads to 64 MiB.
- Names in paths and `?workspace=` must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$` (`backend/src/validate.rs`). Gateway names are checked separately in `registry.rs`.
- File paths must be absolute, without `..` or NUL, and are passed to `sh -c` as positional arguments (`backend/src/sandbox_fs.rs`). The sandbox policy still decides what the command may touch.
- The audit log is created with mode `0600`.
- The update check sends one request to GitHub's releases API at most every six hours and carries no gateway data. `--no-update-check` turns it off (`backend/src/about.rs`).

## Threat model

| Threat | Defense |
|---|---|
| Another user or host on the network reaches the port | Binds to `127.0.0.1:8787` by default. Changing `--addr` is the operator's choice; the README warns to put an authenticating proxy in front. |
| DNS rebinding: a malicious site resolves its name to `127.0.0.1` | The Host allowlist rejects the attacker's host name. |
| CSRF: a malicious page submits a form or `fetch` to the WebUI | Origin must match, and the request must carry the CSRF token, which a cross-site page cannot read. |
| Cross-site WebSocket hijacking | Upgrades need the same Origin and the token in the `csrf` query parameter. |
| Cross-site reads of gateway data | `Sec-Fetch-Site` refusal for `/api/*`; no CORS headers; `connect-src 'self'`. |
| Secret exfiltration through the UI | Secret fields are masked in every response; credential-export RPCs are not allowlisted. |
| Secret echo-back: the UI sends `[redacted]` back and overwrites a real credential | `has_mask` refuses the request with 400 before it reaches the gateway. |
| Script injection or a compromised CDN | `script-src 'self'`, no inline scripts, no third-party origins. |
| Clickjacking | `frame-ancestors 'none'` and `X-Frame-Options: DENY`. |
| Silent changes | Every write is recorded in the audit log, with its result. |
| Privilege escalation beyond the gateway identity | None possible through the WebUI: the gateway enforces roles on every call. |

Out of scope: an attacker who already runs code as your user can read the CLI credentials directly.

## Review checklist

Use this list for every pull request:

- [ ] Gateway responses go through `ProtoJson` (or `ProtoJson::into_value`), never raw `reflect::to_json`.
- [ ] New allowlist entries are unary, marked `Read` or `Write` correctly, and none of them issues tokens, exports credentials, or belongs to supervisors or peers.
- [ ] New non-GET routes and WebSocket routes sit under the main router, so the guard applies.
- [ ] New write routes check `s.read_only` and call `s.audit.record` with identifying fields only.
- [ ] No request body, policy body or credential reaches the audit log or `tracing` output.
- [ ] User input that reaches a shell is a positional argument, never part of the script string.
- [ ] Path segments and query values are validated (`sandbox_name`, `Workspace::parse`, `check_path`).
- [ ] Frontend changes add no inline scripts, external scripts, fonts or CDN URLs.
- [ ] Frontend never sends `[redacted]` values back; secret inputs start empty.
- [ ] Tests cover the guard or redaction behavior you touched (`backend/tests/api.rs` has examples).
- [ ] No real credentials, tokens, personal paths or machine-specific settings in code or fixtures.

Report vulnerabilities privately through [GitHub security advisories](https://github.com/shaharia-lab/openshell-webui/security/advisories/new).

## Related

- [User guide: security](../user-guide/security.md)
- [Architecture](architecture.md)
- [Upstream OpenShell: blocked RPCs](upstream-openshell.md#rpcs-that-stay-blocked)
- [Testing](testing.md)
