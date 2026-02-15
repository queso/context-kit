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

describe("RAPTOR RE-PROBE: Critical Foundation Verification", () => {
  describe("Undefined-Exclusion Behavior (CRITICAL)", () => {
    it("should NOT include correlationId key when undefined", async () => {
      const response = apiError(400, "ERROR", "message", { correlationId: undefined })
      const body = await response.json()

      // Verify the key is completely absent, not just undefined
      expect("correlationId" in body).toBe(false)
      expect(Object.keys(body)).toEqual(["error", "message"])
    })

    it("should NOT include details key when undefined", async () => {
      const response = apiError(400, "ERROR", "message", { details: undefined })
      const body = await response.json()

      expect("details" in body).toBe(false)
      expect(Object.keys(body)).toEqual(["error", "message"])
    })

    it("should NOT include both keys when both undefined", async () => {
      const response = apiError(400, "ERROR", "message", {
        correlationId: undefined,
        details: undefined,
      })
      const body = await response.json()

      expect("correlationId" in body).toBe(false)
      expect("details" in body).toBe(false)
      expect(Object.keys(body)).toEqual(["error", "message"])
    })

    it("should NOT include undefined keys in raw JSON string", async () => {
      const response = apiError(400, "ERROR", "message", {
        correlationId: undefined,
        details: undefined,
      })
      const text = await response.text()

      // Verify undefined is not serialized in any form
      expect(text).not.toContain("correlationId")
      expect(text).not.toContain("details")
      expect(text).not.toContain("undefined")

      // Verify only required fields present
      expect(text).toContain('"error":"ERROR"')
      expect(text).toContain('"message":"message"')
    })

    it("should include correlationId when empty string (not undefined)", async () => {
      const response = apiError(400, "ERROR", "message", { correlationId: "" })
      const body = await response.json()

      expect("correlationId" in body).toBe(true)
      expect(body.correlationId).toBe("")
    })

    it("should include details when null (not undefined)", async () => {
      const response = apiError(400, "ERROR", "message", { details: null })
      const body = await response.json()

      expect("details" in body).toBe(true)
      expect(body.details).toBeNull()
    })

    it("should include details when empty object (not undefined)", async () => {
      const response = apiError(400, "ERROR", "message", { details: {} })
      const body = await response.json()

      expect("details" in body).toBe(true)
      expect(body.details).toEqual({})
    })

    it("should include details when 0 (falsy but not undefined)", async () => {
      const response = apiError(400, "ERROR", "message", { details: 0 })
      const body = await response.json()

      expect("details" in body).toBe(true)
      expect(body.details).toBe(0)
    })

    it("should include details when false (falsy but not undefined)", async () => {
      const response = apiError(400, "ERROR", "message", { details: false })
      const body = await response.json()

      expect("details" in body).toBe(true)
      expect(body.details).toBe(false)
    })
  })

  describe("Convenience Factories - Undefined Handling", () => {
    it("badRequest with undefined details should NOT include details key", async () => {
      const response = badRequest("message", undefined)
      const body = await response.json()

      expect("details" in body).toBe(false)
      expect(body).toEqual({
        error: "BAD_REQUEST",
        message: "message",
      })
    })

    it("badRequest without details parameter should NOT include details key", async () => {
      const response = badRequest("message")
      const body = await response.json()

      expect("details" in body).toBe(false)
    })

    it("serverError with undefined correlationId should NOT include correlationId key", async () => {
      const response = serverError("message", undefined)
      const body = await response.json()

      expect("correlationId" in body).toBe(false)
      expect(body).toEqual({
        error: "INTERNAL_SERVER_ERROR",
        message: "message",
      })
    })

    it("serverError without correlationId parameter should NOT include correlationId key", async () => {
      const response = serverError("message")
      const body = await response.json()

      expect("correlationId" in body).toBe(false)
    })
  })

  describe("Type Safety - ApiErrorResponse", () => {
    it("should enforce required fields at compile time", () => {
      // This test verifies TypeScript type safety
      const error: ApiErrorResponse = {
        error: "ERROR",
        message: "message",
      }

      expect(error).toHaveProperty("error")
      expect(error).toHaveProperty("message")
    })

    it("should allow optional correlationId", () => {
      const error: ApiErrorResponse = {
        error: "ERROR",
        message: "message",
        correlationId: "123",
      }

      expect(error.correlationId).toBe("123")
    })

    it("should allow optional details of any type", () => {
      const error1: ApiErrorResponse = {
        error: "ERROR",
        message: "message",
        details: { field: "value" },
      }

      const error2: ApiErrorResponse = {
        error: "ERROR",
        message: "message",
        details: ["error1", "error2"],
      }

      const error3: ApiErrorResponse = {
        error: "ERROR",
        message: "message",
        details: "string details",
      }

      expect(error1.details).toEqual({ field: "value" })
      expect(error2.details).toEqual(["error1", "error2"])
      expect(error3.details).toBe("string details")
    })

    it("response body should match ApiErrorResponse type", async () => {
      const response = apiError(400, "ERROR", "message", {
        correlationId: "123",
        details: { key: "value" },
      })
      const body = await response.json()

      // Type assertion should work without error
      const typedBody: ApiErrorResponse = body
      expect(typedBody.error).toBe("ERROR")
      expect(typedBody.message).toBe("message")
      expect(typedBody.correlationId).toBe("123")
      expect(typedBody.details).toEqual({ key: "value" })
    })
  })

  describe("Convenience Factories - Status Codes", () => {
    it("should return correct status codes for all factories", async () => {
      const responses = [
        { factory: notFound, expectedStatus: 404 },
        { factory: badRequest, expectedStatus: 400 },
        { factory: unauthorized, expectedStatus: 401 },
        { factory: forbidden, expectedStatus: 403 },
        { factory: serverError, expectedStatus: 500 },
      ]

      for (const { factory, expectedStatus } of responses) {
        const response = factory()
        expect(response.status).toBe(expectedStatus)
      }
    })

    it("should return correct error codes for all factories", async () => {
      const testCases = [
        { factory: notFound, expectedError: "NOT_FOUND" },
        { factory: badRequest, expectedError: "BAD_REQUEST" },
        { factory: unauthorized, expectedError: "UNAUTHORIZED" },
        { factory: forbidden, expectedError: "FORBIDDEN" },
        { factory: serverError, expectedError: "INTERNAL_SERVER_ERROR" },
      ]

      for (const { factory, expectedError } of testCases) {
        const response = factory()
        const body = await response.json()
        expect(body.error).toBe(expectedError)
      }
    })
  })

  describe("Convenience Factories - Default Messages", () => {
    it("should use default messages when not provided", async () => {
      const responses = [
        { factory: notFound, expectedMessage: "Resource not found" },
        { factory: badRequest, expectedMessage: "Bad request" },
        { factory: unauthorized, expectedMessage: "Unauthorized" },
        { factory: forbidden, expectedMessage: "Forbidden" },
        { factory: serverError, expectedMessage: "Internal server error" },
      ]

      for (const { factory, expectedMessage } of responses) {
        const response = factory()
        const body = await response.json()
        expect(body.message).toBe(expectedMessage)
      }
    })

    it("should override default messages when custom message provided", async () => {
      const customMessage = "Custom error message"

      const responses = [
        notFound(customMessage),
        badRequest(customMessage),
        unauthorized(customMessage),
        forbidden(customMessage),
        serverError(customMessage),
      ]

      for (const response of responses) {
        const body = await response.json()
        expect(body.message).toBe(customMessage)
      }
    })

    it("should handle undefined message (use default)", async () => {
      const responses = [
        notFound(undefined),
        badRequest(undefined),
        unauthorized(undefined),
        forbidden(undefined),
        serverError(undefined),
      ]

      for (const response of responses) {
        const body = await response.json()
        expect(body.message).toBeDefined()
        expect(body.message.length).toBeGreaterThan(0)
      }
    })
  })

  describe("Response Correctness", () => {
    it("should always return Response objects", () => {
      const responses = [
        apiError(400, "ERROR", "message"),
        notFound(),
        badRequest(),
        unauthorized(),
        forbidden(),
        serverError(),
      ]

      for (const response of responses) {
        expect(response).toBeInstanceOf(Response)
      }
    })

    it("should always set Content-Type header", () => {
      const responses = [
        apiError(400, "ERROR", "message"),
        notFound(),
        badRequest(),
        unauthorized(),
        forbidden(),
        serverError(),
      ]

      for (const response of responses) {
        expect(response.headers.get("Content-Type")).toBe("application/json")
      }
    })

    it("should produce valid JSON for all responses", async () => {
      const responses = [
        apiError(400, "ERROR", "message"),
        notFound(),
        badRequest(),
        unauthorized(),
        forbidden(),
        serverError(),
      ]

      for (const response of responses) {
        const body = await response.clone().json()
        expect(body).toBeDefined()
        expect(body).toHaveProperty("error")
        expect(body).toHaveProperty("message")
      }
    })

    it("should be consumable via Response.json()", async () => {
      const response = apiError(400, "ERROR", "message")
      const body = await response.json()

      expect(typeof body).toBe("object")
      expect(body).not.toBeNull()
    })

    it("should be consumable via Response.text()", async () => {
      const response = apiError(400, "ERROR", "message")
      const text = await response.text()

      expect(typeof text).toBe("string")
      expect(text.length).toBeGreaterThan(0)

      // Should be valid JSON string
      const parsed = JSON.parse(text)
      expect(parsed).toHaveProperty("error")
    })
  })

  describe("Edge Cases - Empty and Special Values", () => {
    it("should handle empty string error code", async () => {
      const response = apiError(400, "", "message")
      const body = await response.json()
      expect(body.error).toBe("")
    })

    it("should handle empty string message", async () => {
      const response = apiError(400, "ERROR", "")
      const body = await response.json()
      expect(body.message).toBe("")
    })

    it("should handle empty string correlationId", async () => {
      const response = apiError(400, "ERROR", "message", { correlationId: "" })
      const body = await response.json()
      expect(body.correlationId).toBe("")
      expect("correlationId" in body).toBe(true)
    })

    it("should differentiate between undefined and empty string", async () => {
      const responseUndefined = apiError(400, "ERROR", "message", {
        correlationId: undefined,
      })
      const responseEmpty = apiError(400, "ERROR", "message", { correlationId: "" })

      const bodyUndefined = await responseUndefined.json()
      const bodyEmpty = await responseEmpty.json()

      expect("correlationId" in bodyUndefined).toBe(false)
      expect("correlationId" in bodyEmpty).toBe(true)
      expect(bodyEmpty.correlationId).toBe("")
    })

    it("should handle complex nested details correctly", async () => {
      const complexDetails = {
        level1: {
          level2: {
            level3: {
              array: [1, 2, 3],
              string: "value",
              null: null,
              boolean: true,
            },
          },
        },
      }

      const response = apiError(400, "ERROR", "message", { details: complexDetails })
      const body = await response.json()

      expect(body.details).toEqual(complexDetails)
    })
  })

  describe("Return Values and Side Effects", () => {
    it("apiError should return Response without side effects", () => {
      const response1 = apiError(400, "ERROR", "message")
      const response2 = apiError(400, "ERROR", "message")

      // Should create independent Response objects
      expect(response1).not.toBe(response2)
      expect(response1).toBeInstanceOf(Response)
      expect(response2).toBeInstanceOf(Response)
    })

    it("convenience factories should return Response without side effects", () => {
      const response1 = notFound()
      const response2 = notFound()

      expect(response1).not.toBe(response2)
      expect(response1).toBeInstanceOf(Response)
    })

    it("should not mutate options object", async () => {
      const options = { correlationId: "123", details: { key: "value" } }
      const originalOptions = JSON.parse(JSON.stringify(options))

      apiError(400, "ERROR", "message", options)

      expect(options).toEqual(originalOptions)
    })
  })
})
