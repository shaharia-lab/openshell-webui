/** An error response from the console API. */
export class ApiError extends Error {
  readonly status: number
  /** gRPC status code name when the gateway produced the error. */
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }

  get isCsrf() {
    return this.status === 403 && /CSRF token/i.test(this.message)
  }

  get isNotFound() {
    return this.status === 404
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
