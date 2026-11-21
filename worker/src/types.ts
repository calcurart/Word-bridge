// Minimal D1 typing, so the Worker needs no extra type packages.
export interface D1Result<T> { results: T[] }
export interface D1Statement {
  bind(...values: unknown[]): D1Statement
  first<T>(): Promise<T | null>
  all<T>(): Promise<D1Result<T>>
  run(): Promise<unknown>
}
export interface D1Database { prepare(sql: string): D1Statement }

export interface Env {
  DB: D1Database
  /** Comma-separated origins allowed to send suggestions and scores, e.g. "https://example.github.io". */
  ALLOWED_ORIGINS: string
}
