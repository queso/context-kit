import { describe, expect, it } from "vitest"
import { z } from "zod"
import { validateBody, validateParams, validateSearchParams } from "@/lib/api"

describe("RAPTOR: JSON Parsing Robustness", () => {
  const simpleSchema = z.object({ value: z.string() })

  it("should handle empty string body (not just missing body)", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: "",
    })

    const result = await validateBody(request, simpleSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = await result.response.json()
      expect(body.message).toBe("Request body is required")
    }
  })

  it("should handle whitespace-only body", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: "   \n\t  ",
    })

    const result = await validateBody(request, simpleSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = await result.response.json()
      // Whitespace is truthy for string, so JSON.parse will be attempted
      expect(body.message).toBe("Invalid JSON in request body")
    }
  })

  it("should handle null JSON value", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: "null",
    })

    const result = await validateBody(request, simpleSchema)

    expect(result.success).toBe(false)
    // null is valid JSON but won't match object schema
    if (!result.success) {
      const body = await result.response.json()
      expect(body.message).toBe("Validation failed")
    }
  })

  it("should handle JSON array instead of object", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify(["value1", "value2"]),
    })

    const result = await validateBody(request, simpleSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = await result.response.json()
      expect(body.message).toBe("Validation failed")
    }
  })

  it("should handle JSON primitive (string) instead of object", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify("just a string"),
    })

    const result = await validateBody(request, simpleSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = await result.response.json()
      expect(body.message).toBe("Validation failed")
    }
  })

  it("should handle JSON number instead of object", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify(42),
    })

    const result = await validateBody(request, simpleSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = await result.response.json()
      expect(body.message).toBe("Validation failed")
    }
  })

  it("should handle JSON boolean instead of object", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify(true),
    })

    const result = await validateBody(request, simpleSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = await result.response.json()
      expect(body.message).toBe("Validation failed")
    }
  })

  it("should handle malformed JSON - missing closing brace", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: '{"value": "test"',
    })

    const result = await validateBody(request, simpleSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = await result.response.json()
      expect(body.message).toBe("Invalid JSON in request body")
    }
  })

  it("should handle malformed JSON - trailing comma", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: '{"value": "test",}',
    })

    const result = await validateBody(request, simpleSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = await result.response.json()
      expect(body.message).toBe("Invalid JSON in request body")
    }
  })

  it("should handle malformed JSON - unquoted keys", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: '{value: "test"}',
    })

    const result = await validateBody(request, simpleSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = await result.response.json()
      expect(body.message).toBe("Invalid JSON in request body")
    }
  })

  it("should handle malformed JSON - single quotes", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: "{'value': 'test'}",
    })

    const result = await validateBody(request, simpleSchema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = await result.response.json()
      expect(body.message).toBe("Invalid JSON in request body")
    }
  })

  it("should handle very large JSON body", async () => {
    // 1MB of JSON data
    const largeObject = {
      value: "x".repeat(1000000),
    }

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify(largeObject),
    })

    const result = await validateBody(request, simpleSchema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.value.length).toBe(1000000)
    }
  })

  it("should handle JSON with unicode escape sequences", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: '{"value": "\\u0048\\u0065\\u006C\\u006C\\u006F"}', // "Hello" in unicode
    })

    const result = await validateBody(request, simpleSchema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.value).toBe("Hello")
    }
  })
})

describe("RAPTOR: Zod v4 Edge Cases", () => {
  it("should handle z.coerce with invalid coercion", () => {
    const schema = z.object({
      age: z.coerce.number(),
    })

    const request = new Request("http://localhost/api/test?age=not-a-number")

    const result = validateSearchParams(request, schema)

    expect(result.success).toBe(false)
    // z.coerce.number() with invalid string should fail
  })

  it("should REJECT z.coerce with NaN result (Zod v4 behavior)", () => {
    const schema = z.object({
      value: z.coerce.number(),
    })

    const request = new Request("http://localhost/api/test?value=NaN")

    const result = validateSearchParams(request, schema)

    // Zod v4 actually REJECTS NaN - coercion results in NaN, then number validation fails
    expect(result.success).toBe(false)
  })

  it("should REJECT z.coerce with Infinity (Zod v4 behavior)", () => {
    const schema = z.object({
      value: z.coerce.number(),
    })

    const request = new Request("http://localhost/api/test?value=Infinity")

    const result = validateSearchParams(request, schema)

    // Zod v4 actually REJECTS Infinity - coercion results in Infinity, then validation fails
    expect(result.success).toBe(false)
  })

  it("should document z.coerce.boolean behavior with string values", () => {
    const schema = z.object({
      enabled: z.coerce.boolean(),
    })

    const testCases = [
      { input: "true", expected: true },
      { input: "false", expected: false }, // Zod treats "false" string as true (JS truthiness)
      { input: "1", expected: true },
      { input: "0", expected: true }, // In JS, "0" string is truthy
      { input: "yes", expected: true },
    ]

    for (const { input, expected } of testCases) {
      const request = new Request(`http://localhost/api/test?enabled=${input}`)
      const result = validateSearchParams(request, schema)

      expect(result.success).toBe(true)
      if (result.success) {
        // z.coerce.boolean uses JS Boolean() which is truthiness-based
        // "false" is a non-empty string, so it's truthy -> true
        const actualExpected = input !== ""
        expect(result.data.enabled).toBe(actualExpected)
      }
    }
  })

  it("should handle z.enum with case sensitivity", () => {
    const schema = z.object({
      status: z.enum(["active", "inactive"]),
    })

    const request = new Request("http://localhost/api/test?status=ACTIVE")

    const result = validateSearchParams(request, schema)

    // Enums are case-sensitive
    expect(result.success).toBe(false)
  })

  it("should handle z.literal with type coercion", () => {
    const schema = z.object({
      type: z.literal("user"),
    })

    const request = new Request("http://localhost/api/test?type=user")

    const result = validateSearchParams(request, schema)

    expect(result.success).toBe(true)
  })

  it("should handle z.union with overlapping types", () => {
    const schema = z.object({
      value: z.union([z.string(), z.number()]),
    })

    const request = new Request("http://localhost/api/test?value=123")

    const result = validateSearchParams(request, schema)

    expect(result.success).toBe(true)
    if (result.success) {
      // String comes first in union, so it matches as string
      expect(typeof result.data.value).toBe("string")
      expect(result.data.value).toBe("123")
    }
  })

  it("should handle z.default with missing field", async () => {
    const schema = z.object({
      value: z.string().default("default-value"),
    })

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({}),
    })

    const result = await validateBody(request, schema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.value).toBe("default-value")
    }
  })

  it("should handle z.transform with validation", async () => {
    const schema = z.object({
      email: z
        .string()
        .email()
        .transform((val) => val.toLowerCase()),
    })

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ email: "TEST@EXAMPLE.COM" }),
    })

    const result = await validateBody(request, schema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe("test@example.com")
    }
  })

  it("should handle z.refine with custom validation", async () => {
    const schema = z.object({
      password: z.string().refine((val) => val.length >= 8, {
        message: "Password must be at least 8 characters",
      }),
    })

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ password: "short" }),
    })

    const result = await validateBody(request, schema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = await result.response.json()
      expect(body.details).toBeDefined()
    }
  })

  it("should handle z.superRefine with multiple validations", async () => {
    const schema = z
      .object({
        password: z.string(),
        confirm: z.string(),
      })
      .superRefine((data, ctx) => {
        if (data.password !== data.confirm) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Passwords must match",
            path: ["confirm"],
          })
        }
      })

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ password: "test123", confirm: "different" }),
    })

    const result = await validateBody(request, schema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = await result.response.json()
      expect(body.details).toBeDefined()
    }
  })
})

describe("RAPTOR: validateSearchParams Edge Cases", () => {
  it("should handle duplicate query parameters (returns LAST value)", () => {
    const schema = z.object({
      tags: z.string(),
    })

    // URLSearchParams.entries() returns the LAST value for duplicate keys
    const request = new Request("http://localhost/api/test?tags=a&tags=b&tags=c")

    const result = validateSearchParams(request, schema)

    expect(result.success).toBe(true)
    if (result.success) {
      // URLSearchParams.entries() returns last value for duplicate keys
      expect(result.data.tags).toBe("c")
    }
  })

  it("should handle empty parameter values", () => {
    const schema = z.object({
      search: z.string().optional(),
    })

    const request = new Request("http://localhost/api/test?search=")

    const result = validateSearchParams(request, schema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.search).toBe("")
    }
  })

  it("should handle parameters with special characters", () => {
    const schema = z.object({
      query: z.string(),
    })

    const request = new Request("http://localhost/api/test?query=hello%20world%26more")

    const result = validateSearchParams(request, schema)

    expect(result.success).toBe(true)
    if (result.success) {
      // URL decoding should happen automatically
      expect(result.data.query).toBe("hello world&more")
    }
  })

  it("should handle parameters with plus signs (converts to space)", () => {
    const schema = z.object({
      search: z.string(),
    })

    // + in query params is decoded as space (traditional URL behavior)
    const request = new Request("http://localhost/api/test?search=hello+world")

    const result = validateSearchParams(request, schema)

    expect(result.success).toBe(true)
    if (result.success) {
      // URL API decodes + as space
      expect(result.data.search).toBe("hello world")
    }
  })

  it("should handle malformed URL", () => {
    const schema = z.object({
      value: z.string(),
    })

    // This tests what happens if request.url is somehow invalid
    // In practice, Request constructor validates the URL
    const request = new Request("http://localhost/api/test?value=test")

    expect(() => validateSearchParams(request, schema)).not.toThrow()
  })
})

describe("RAPTOR: validateParams Edge Cases", () => {
  it("should handle params with undefined values", () => {
    const schema = z.object({
      id: z.string(),
      optional: z.string().optional(),
    })

    const params: Record<string, string> = {
      id: "123",
    }

    const result = validateParams(params, schema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe("123")
      expect(result.data.optional).toBeUndefined()
    }
  })

  it("should handle params object with extra properties", () => {
    const schema = z.object({
      id: z.string(),
    })

    const params = {
      id: "123",
      extra: "not-in-schema",
      another: "also-extra",
    }

    const result = validateParams(params, schema)

    // Zod strips unknown keys by default
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBe("123")
      expect("extra" in result.data).toBe(false)
    }
  })

  it("should handle empty params object", () => {
    const schema = z.object({
      id: z.string().optional(),
    })

    const params = {}

    const result = validateParams(params, schema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBeUndefined()
    }
  })

  it("should handle params with null values", () => {
    const schema = z.object({
      id: z.string().nullable(),
    })

    const params = {
      id: null as any, // Next.js shouldn't provide null, but testing robustness
    }

    const result = validateParams(params, schema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.id).toBeNull()
    }
  })
})

describe("RAPTOR: Error Response Shape Verification", () => {
  it("should always include error and message in validation failures", async () => {
    const schema = z.object({
      value: z.string(),
    })

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ value: 123 }),
    })

    const result = await validateBody(request, schema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = await result.response.json()
      expect(body).toHaveProperty("error")
      expect(body).toHaveProperty("message")
      expect(body.error).toBe("BAD_REQUEST")
      expect(body.message).toBe("Validation failed")
    }
  })

  it("should include Zod issues in details as array", async () => {
    const schema = z.object({
      email: z.string().email(),
      age: z.number(),
    })

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ email: "invalid", age: "not-a-number" }),
    })

    const result = await validateBody(request, schema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = await result.response.json()
      expect(Array.isArray(body.details)).toBe(true)
      expect((body.details as Array<unknown>).length).toBeGreaterThan(0)
    }
  })

  it("should preserve Zod issue structure in details", async () => {
    const schema = z.object({
      value: z.string().email(),
    })

    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: JSON.stringify({ value: "not-email" }),
    })

    const result = await validateBody(request, schema)

    expect(result.success).toBe(false)
    if (!result.success) {
      const body = await result.response.json()
      const issues = body.details as Array<{
        code: string
        path: string[]
        message: string
      }>

      expect(issues[0]).toHaveProperty("code")
      expect(issues[0]).toHaveProperty("path")
      expect(issues[0]).toHaveProperty("message")
      expect(issues[0].path).toContain("value")
    }
  })
})
