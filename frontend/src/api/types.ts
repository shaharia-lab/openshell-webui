// Shapes of the WebUI's own endpoints. Gateway messages come from the
// generated proto types in src/gen (protojson with proto field names).

export interface Session {
  csrf_token: string
  read_only: boolean
}

/** The WebUI's own version, the local OpenShell CLI's, and the latest release. */
export interface About {
  version: string
  repository: string
  /** Absent when the openshell CLI is not on the WebUI's PATH. */
  openshell_cli_version?: string | null
  /** False when started with --no-update-check. */
  update_check: boolean
  latest_release?: { version: string; url: string } | null
  update_available: boolean
}

/** A gateway registered in the OpenShell CLI. */
export interface Gateway {
  name: string
  endpoint: string
  auth_mode: string
  is_remote: boolean
  remote_host?: string
  oidc_issuer?: string
  active: boolean
  local: boolean
}

/** An OpenShell-managed container on the local Docker engine. */
export interface Container {
  id: string
  name: string
  image: string
  state: string
  status: string
  sandbox: string
  /** Workspace of the sandbox (label openshell.ai/sandbox-namespace); empty on older backends. */
  workspace?: string
  role: string
  cpu?: string
  mem?: string
  memPerc?: string
  netIO?: string
  pids?: string
}

export interface GatewayLogLine {
  time: string
  level: string
  file: string
  msg: string
}

export interface GatewayLog {
  dir: string
  lines: GatewayLogLine[]
}

export interface AuditEntry {
  time: string
  gateway: string
  workspace?: string
  method: string
  target?: Record<string, string>
  result: string
  error?: string
}

export interface AuditLog {
  path: string
  entries: AuditEntry[]
}

/** Value the server puts in place of a secret field. Never send it back. */
export const REDACTED = '[redacted]'

/** Workspace selector value that lists every workspace the caller can see. */
export const ALL_WORKSPACES = '*'

/** One entry of a sandbox directory listing. */
export interface FileEntry {
  name: string
  type: 'file' | 'dir' | 'symlink' | 'other'
  size: number
  /** Unix seconds. */
  mtime: number
  /** Octal permission bits, e.g. "644". */
  mode: string
  owner: string
  link_target?: string
}

export interface FileListing {
  path: string
  entries: FileEntry[]
}
