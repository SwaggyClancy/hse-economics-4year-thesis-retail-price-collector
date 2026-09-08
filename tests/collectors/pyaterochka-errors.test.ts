import { describe, expect, it } from "vitest";
import {
  HttpResponseError,
  InvalidResponseError,
  isRetryableCollectionError,
} from "../../src/collectors/pyaterochka/errors.js";

describe("isRetryableCollectionError", () => {
  it.each([408, 425, 500, 502, 503, 504])("retries temporary HTTP %i", (status) => {
    expect(isRetryableCollectionError(new HttpResponseError(status, "", null))).toBe(true);
  });

  it.each([400, 401, 403, 404, 429])("does not retry permanent or rate-limited HTTP %i", (status) => {
    expect(isRetryableCollectionError(new HttpResponseError(status, "", null))).toBe(false);
  });
  it("stops instead of ignoring Retry-After", () => {
    expect(isRetryableCollectionError(new HttpResponseError(503, "wait", "120"))).toBe(false);
  });

  it("does not retry an invalid response schema", () => {
    expect(isRetryableCollectionError(new InvalidResponseError("invalid"))).toBe(false);
  });
});
