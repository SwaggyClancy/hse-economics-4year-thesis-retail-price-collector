import { describe, expect, it } from "vitest";
import type {
  PageRequest,
  PageResponse,
  PyaterochkaPageClient,
} from "../../src/browser/pyaterochka-page-client.js";
import {
  collectPyaterochkaCategory,
  type CollectorOptions,
  type PageSink,
} from "../../src/collectors/pyaterochka/collector.js";
import { HttpResponseError } from "../../src/collectors/pyaterochka/errors.js";
import type { CollectedPage } from "../../src/collectors/pyaterochka/types.js";
import type { LogLevel, Logger } from "../../src/core/logger.js";

const options: CollectorOptions = {
  storeId: "3448",
  categoryId: "251C12887",
  pageLimit: 12,
  maximumPages: 10,
  minimumPageDelayMs: 0,
  maximumPageDelayMs: 0,
  maxAttempts: 3,
};

class MemorySink implements PageSink {
  public readonly pages: CollectedPage[] = [];

  public writePage(page: CollectedPage): Promise<void> {
    this.pages.push(page);
    return Promise.resolve();
  }
}

class MemoryLogger implements Logger {
  public readonly events: string[] = [];

  public log(
    _level: LogLevel,
    event: string,
  ): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}

function response(request: PageRequest, products: readonly unknown[]): PageResponse {
  return {
    requestedAt: "2026-08-17T18:00:00.000Z",
    receivedAt: "2026-08-17T18:00:00.100Z",
    durationMs: 100,
    url: `https://example.test/?offset=${request.offset}`,
    status: 200,
    statusText: "OK",
    ok: true,
    retryAfter: null,
    body: { products },
  };
}

describe("collectPyaterochkaCategory", () => {
  it("collects full pages until the first short page", async () => {
    const requests: PageRequest[] = [];
    const client: PyaterochkaPageClient = {
      fetchPage(request): Promise<PageResponse> {
        requests.push(request);
        const count = request.offset === 0 ? 12 : 3;
        return Promise.resolve(
          response(
            request,
            Array.from({ length: count }, (_, index) => ({ plu: request.offset + index })),
          ),
        );
      },
    };
    const sink = new MemorySink();
    const logger = new MemoryLogger();

    const result = await collectPyaterochkaCategory(client, sink, logger, options);

    expect(requests.map((request) => request.offset)).toEqual([0, 12]);
    expect(result.products).toHaveLength(15);
    expect(sink.pages).toHaveLength(2);
    expect(logger.events).toEqual([
      "pyaterochka.page.collected",
      "pyaterochka.page.collected",
    ]);
  });

  it("accepts an empty category as a complete one-page result", async () => {
    const client: PyaterochkaPageClient = {
      fetchPage(request): Promise<PageResponse> {
        return Promise.resolve(response(request, []));
      },
    };

    const result = await collectPyaterochkaCategory(
      client,
      new MemorySink(),
      new MemoryLogger(),
      options,
    );

    expect(result.pages).toHaveLength(1);
    expect(result.products).toHaveLength(0);
  });

  it("does not retry a permanent HTTP error", async () => {
    let attempts = 0;
    const client: PyaterochkaPageClient = {
      fetchPage(request): Promise<PageResponse> {
        attempts += 1;
        return Promise.resolve({
            ...response(request, []),
            status: 404,
            statusText: "Not Found",
            ok: false,
          });
      },
    };

    await expect(
      collectPyaterochkaCategory(client, new MemorySink(), new MemoryLogger(), options),
    ).rejects.toBeInstanceOf(HttpResponseError);
    expect(attempts).toBe(1);
  });
});
