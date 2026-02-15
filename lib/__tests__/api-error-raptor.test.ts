import { describe, expect, it } from "vitest"
import {
  type ApiErrorResponse,
  apiError,
  badRequest,
  forbidden,
  notFound,
  serverError,
  unauthorized,
} from "@/lib/api"

describe("RAPTOR: Wiring Verification", () => {
  it("should have all exports importable", () => {
    // Type export
    const typeCheck: ApiErrorResponse = {
      error: "TEST",
      message: "test",
    }
    expect(typeCheck).toBeDefined()

    // Function exports
    expect(apiError).toBeDefined()
    expect(notFound).toBeDefined()
    expect(badRequest).toBeDefined()
    expect(unauthorized).toBeDefined()
    expect(forbidden).toBeDefined()
    expect(serverError).toBeDefined()
  })

  it("should export functions as callable", () => {
    expect(typeof apiError).toBe("function")
    expect(typeof notFound).toBe("function")
    expect(typeof badRequest).toBe("function")
    expect(typeof unauthorized).toBe("function")
    expect(typeof forbidden).toBe("function")
    expect(typeof serverError).toBe("function")
  })
})

describe("RAPTOR: Fence Test - Basic Functionality", () => {
  it("should create valid Response objects from all functions", () => {
    const responses = [
      apiError(500, "TEST", "test message"),
      notFound(),
      badRequest(),
      unauthorized(),
      forbidden(),
      serverError(),
    ]

    for (const response of responses) {
      expect(response).toBeInstanceOf(Response)
      expect(response.status).toBeGreaterThanOrEqual(200)
      expect(response.status).toBeLessThan(600)
      expect(response.headers.get("Content-Type")).toBe("application/json")
    }
  })

  it("should produce parseable JSON bodies", async () => {
    const responses = [
      apiError(500, "TEST", "test"),
      notFound("custom"),
      badRequest("custom", { key: "value" }),
      unauthorized("custom"),
      forbidden("custom"),
      serverError("custom", "corr-123"),
    ]

    for (const response of responses) {
      const body = await response.clone().json()
      expect(body).toHaveProperty("error")
      expect(body).toHaveProperty("message")
      expect(typeof body.error).toBe("string")
      expect(typeof body.message).toBe("string")
    }
  })
})

describe("RAPTOR: Edge Probe - Empty Strings", () => {
  it("should handle empty string in error parameter", async () => {
    const response = apiError(400, "", "message")
    const body = await response.json()
    expect(body.error).toBe("")
    expect(body.message).toBe("message")
  })

  it("should handle empty string in message parameter", async () => {
    const response = apiError(400, "ERROR", "")
    const body = await response.json()
    expect(body.error).toBe("ERROR")
    expect(body.message).toBe("")
  })

  it("should handle empty strings in both error and message", async () => {
    const response = apiError(400, "", "")
    const body = await response.json()
    expect(body.error).toBe("")
    expect(body.message).toBe("")
  })

  it("should handle empty string in convenience factory messages", async () => {
    const responses = [
      notFound(""),
      badRequest(""),
      unauthorized(""),
      forbidden(""),
      serverError(""),
    ]

    for (const response of responses) {
      const body = await response.clone().json()
      expect(body.message).toBe("")
    }
  })

  it("should handle empty string in correlationId", async () => {
    const response = serverError("message", "")
    const body = await response.json()
    expect(body.correlationId).toBe("")
  })
})

describe("RAPTOR: Edge Probe - Special Characters", () => {
  it("should handle special characters in error field", async () => {
    const specialChars = [
      "<script>alert('xss')</script>",
      "error\n\nwith\nnewlines",
      "error\twith\ttabs",
      "error\\with\\backslashes",
      'error"with"quotes',
      "error'with'apostrophes",
    ]

    for (const char of specialChars) {
      const response = apiError(400, char, "message")
      const body = await response.json()
      expect(body.error).toBe(char)

      // Verify JSON serialization round-trips correctly
      const reserialized = JSON.parse(JSON.stringify(body))
      expect(reserialized.error).toBe(char)
    }
  })

  it("should handle special characters in message field", async () => {
    const specialChars = [
      "Message with <html>tags</html>",
      "Message\nwith\nnewlines",
      "Message\twith\ttabs",
      'Message "with" quotes',
      "Message 'with' apostrophes",
      "Message with emoji 🚀",
    ]

    for (const char of specialChars) {
      const response = apiError(400, "ERROR", char)
      const body = await response.json()
      expect(body.message).toBe(char)
    }
  })

  it("should handle unicode and emoji in all fields", async () => {
    const response = apiError(400, "ERROR_🔥", "Message with emoji 🚀", {
      correlationId: "corr-🎯",
      details: { emoji: "✅", unicode: "日本語" },
    })
    const body = await response.json()
    expect(body.error).toBe("ERROR_🔥")
    expect(body.message).toBe("Message with emoji 🚀")
    expect(body.correlationId).toBe("corr-🎯")
    expect(body.details).toEqual({ emoji: "✅", unicode: "日本語" })
  })
})

describe("RAPTOR: Edge Probe - Very Long Strings", () => {
  it("should handle very long error strings", async () => {
    const longString = "A".repeat(10000)
    const response = apiError(400, longString, "message")
    const body = await response.json()
    expect(body.error).toBe(longString)
    expect(body.error.length).toBe(10000)
  })

  it("should handle very long message strings", async () => {
    const longString = "B".repeat(10000)
    const response = apiError(400, "ERROR", longString)
    const body = await response.json()
    expect(body.message).toBe(longString)
    expect(body.message.length).toBe(10000)
  })

  it("should handle very long correlationId", async () => {
    const longCorrelationId = "C".repeat(1000)
    const response = serverError("message", longCorrelationId)
    const body = await response.json()
    expect(body.correlationId).toBe(longCorrelationId)
  })
})

describe("RAPTOR: Edge Probe - Unusual Status Codes", () => {
  it("should handle success status codes (2xx)", async () => {
    const response = apiError(200, "SUCCESS", "Successful operation")
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.error).toBe("SUCCESS")
  })

  it("should handle unusual but valid status codes", async () => {
    // Response constructor only accepts 200-599; 204 can't have a body
    const statusCodes = [200, 201, 301, 302, 418, 429, 451, 502, 503]

    for (const status of statusCodes) {
      const response = apiError(status, "ERROR", "message")
      expect(response.status).toBe(status)
    }
  })

  it("should handle edge case status codes", async () => {
    // Response constructor only accepts 200-599
    const minResponse = apiError(200, "OK", "Success")
    expect(minResponse.status).toBe(200)

    const maxResponse = apiError(599, "ERROR", "Network error")
    expect(maxResponse.status).toBe(599)
  })

  it("should handle invalid status codes (implementation dependent)", async () => {
    // These might throw or be coerced by the Response constructor
    // Testing what actually happens
    const testCases = [0, -1, 99, 600, 1000]

    for (const status of testCases) {
      try {
        const response = apiError(status, "ERROR", "message")
        // If it doesn't throw, verify it's still a Response
        expect(response).toBeInstanceOf(Response)
      } catch (error) {
        // Document that invalid status codes throw
        expect(error).toBeDefined()
      }
    }
  })
})

describe("RAPTOR: Edge Probe - Complex Details Objects", () => {
  it("should handle deeply nested details", async () => {
    const deepDetails = {
      level1: {
        level2: {
          level3: {
            level4: {
              value: "deep",
            },
          },
        },
      },
    }
    const response = badRequest("Validation failed", deepDetails)
    const body = await response.json()
    expect(body.details).toEqual(deepDetails)
  })

  it("should handle arrays in details", async () => {
    const arrayDetails = {
      errors: ["error1", "error2", "error3"],
      nested: [{ field: "name" }, { field: "email" }],
    }
    const response = badRequest("Multiple errors", arrayDetails)
    const body = await response.json()
    expect(body.details).toEqual(arrayDetails)
  })

  it("should handle null and undefined in details", async () => {
    const detailsWithNull = {
      field1: null,
      field2: undefined,
      field3: "value",
    }
    const response = badRequest("Mixed values", detailsWithNull)
    const body = await response.json()
    // undefined values are dropped in JSON serialization
    expect(body.details).toEqual({
      field1: null,
      field3: "value",
    })
  })

  it("should handle circular references gracefully (or fail predictably)", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing circular reference edge case
    const circular: any = { name: "obj" }
    circular.self = circular

    // This should throw during JSON.stringify
    expect(() => {
      apiError(400, "ERROR", "message", { details: circular })
    }).toThrow()
  })

  it("should handle various primitive types in details", async () => {
    const details = {
      string: "text",
      number: 42,
      boolean: true,
      null: null,
      array: [1, 2, 3],
      object: { key: "value" },
    }
    const response = badRequest("All types", details)
    const body = await response.json()
    expect(body.details).toEqual(details)
  })
})

describe("RAPTOR: Error Injection - Options Parameter", () => {
  it("should handle null options (type safety)", () => {
    // TypeScript should prevent this, but testing runtime behavior
    // @ts-expect-error Testing null options
    expect(() => apiError(400, "ERROR", "message", null)).toThrow()
  })

  it("should handle options with extra unknown properties", async () => {
    const response = apiError(400, "ERROR", "message", {
      correlationId: "123",
      details: { key: "value" },
      // @ts-expect-error Testing extra properties
      extraProp: "should be ignored",
    })
    const body = await response.json()
    // Extra properties should be ignored
    expect(body).toEqual({
      error: "ERROR",
      message: "message",
      correlationId: "123",
      details: { key: "value" },
    })
  })

  it("should handle undefined correlationId explicitly", async () => {
    const response = apiError(400, "ERROR", "message", {
      correlationId: undefined,
    })
    const body = await response.json()
    expect(body).not.toHaveProperty("correlationId")
  })

  it("should handle undefined details explicitly", async () => {
    const response = apiError(400, "ERROR", "message", {
      details: undefined,
    })
    const body = await response.json()
    expect(body).not.toHaveProperty("details")
  })
})

describe("RAPTOR: Response Correctness - Headers", () => {
  it("should only set Content-Type header", () => {
    const response = apiError(400, "ERROR", "message")
    const headers = Array.from(response.headers.entries())
    expect(headers).toEqual([["content-type", "application/json"]])
  })

  it("should have consistent Content-Type across all factories", () => {
    const responses = [notFound(), badRequest(), unauthorized(), forbidden(), serverError()]

    for (const response of responses) {
      expect(response.headers.get("content-type")).toBe("application/json")
    }
  })
})

describe("RAPTOR: Response Correctness - Body Consumption", () => {
  it("should be consumable only once without clone", async () => {
    const response = apiError(400, "ERROR", "message")
    await response.json()

    // Second consumption should fail
    await expect(response.json()).rejects.toThrow()
  })

  it("should be consumable multiple times with clone", async () => {
    const response = apiError(400, "ERROR", "message")
    const body1 = await response.clone().json()
    const body2 = await response.clone().json()
    const body3 = await response.json()

    expect(body1).toEqual(body2)
    expect(body2).toEqual(body3)
  })

  it("should have bodyUsed flag correctly set", async () => {
    const response = apiError(400, "ERROR", "message")
    expect(response.bodyUsed).toBe(false)

    await response.json()
    expect(response.bodyUsed).toBe(true)
  })
})

describe("RAPTOR: Type Safety - ApiErrorResponse Shape", () => {
  it("should match ApiErrorResponse type exactly", async () => {
    const response = apiError(400, "ERROR", "message", {
      correlationId: "123",
      details: { key: "value" },
    })
    const body = await response.json()

    // Type assertion to verify shape
    const typedBody: ApiErrorResponse = body
    expect(typedBody.error).toBe("ERROR")
    expect(typedBody.message).toBe("message")
    expect(typedBody.correlationId).toBe("123")
    expect(typedBody.details).toEqual({ key: "value" })
  })

  it("should not include correlationId when not provided", async () => {
    const response = apiError(400, "ERROR", "message")
    const body = await response.json()
    expect("correlationId" in body).toBe(false)
  })

  it("should not include details when not provided", async () => {
    const response = apiError(400, "ERROR", "message")
    const body = await response.json()
    expect("details" in body).toBe(false)
  })

  it("should not include extra fields beyond ApiErrorResponse", async () => {
    const response = apiError(400, "ERROR", "message", {
      correlationId: "123",
    })
    const body = await response.json()
    const keys = Object.keys(body)
    expect(keys.sort()).toEqual(["correlationId", "error", "message"].sort())
  })
})
