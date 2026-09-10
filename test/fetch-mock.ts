import { mock } from "bun:test"

// `globalThis.fetch` assignments leak across files (bun runs every test file in one process), so
// the real fetch is captured here once and restored by callers via `restoreFetch()`.
const realFetch = globalThis.fetch

/** Replaces global fetch with a mock that resolves to the given partial Response. */
export function mockFetch(response: Partial<Response>) {
  const fetchMock = mock(() => Promise.resolve(response as Response))
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}

/** Awaits a promise that must reject; fails the test if it resolves. */
export async function captureRejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error("Expected promise to reject, but it resolved")
}

/** Restores the real `globalThis.fetch` captured at module load. Call from `afterAll`. */
export function restoreFetch() {
  globalThis.fetch = realFetch
}
