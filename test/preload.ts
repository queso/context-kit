// Preloaded by `bun test` (see bunfig.toml). Registers a DOM and jest-dom matchers so React
// Testing Library tests run under Bun.
//
// Order matters: @testing-library/dom binds `screen` to `document.body` at import time, so the
// DOM must exist BEFORE testing-library loads. Static imports hoist, so happy-dom is registered
// first and the testing libraries are imported dynamically afterwards.
import { afterEach, expect } from "bun:test"
import { GlobalRegistrator } from "@happy-dom/global-registrator"

// Tests that read env through the real `getEnv()` need a valid DATABASE_URL.
process.env.DATABASE_URL ??= "sqlite::memory:"

// happy-dom's registrator overwrites every window property whose value differs from globalThis,
// including its own fetch/Request/Response, Web Streams, TextEncoder, URL, and AbortController.
// The lib/ tests assert against Bun's natives (e.g. `toBeInstanceOf(Response)`), and lib/sse.ts
// needs a WritableStream with getWriter(), so snapshot the natives and restore them after register().
const natives = {
  fetch,
  Request,
  Response,
  Headers,
  FormData,
  ReadableStream,
  WritableStream,
  TransformStream,
  TextEncoder,
  TextDecoder,
  URL,
  URLSearchParams,
  AbortController,
  AbortSignal,
}

GlobalRegistrator.register()

for (const [name, value] of Object.entries(natives)) {
  Object.defineProperty(globalThis, name, { value, writable: true, configurable: true })
}

const { cleanup } = await import("@testing-library/react")
// The namespace object carries a synthetic `default` key that is not a matcher; drop it.
const { default: _defaultExport, ...jestDomMatchers } = await import(
  "@testing-library/jest-dom/matchers"
)

expect.extend(jestDomMatchers)

// RTL only auto-registers cleanup when `afterEach` is a global at import time; do it explicitly.
afterEach(() => {
  cleanup()
})
