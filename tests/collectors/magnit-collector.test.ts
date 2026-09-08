import { describe, expect, it, vi } from "vitest";
import type {
  MagnitPageClient,
  MagnitPageRequest,
  MagnitPageResponse,
} from "../../src/browser/magnit-page-client.js";
import {
  collectMagnitCategory,
  type MagnitCollectorOptions,
  type MagnitPageSink,
} from "../../src/collectors/magnit/collector.js";
import { MagnitInvalidResponseError } from "../../src/collectors/magnit/errors.js";
import type { MagnitCollectedPage } from "../../src/collectors/magnit/types.js";
import type { Logger } from "../../src/core/logger.js";

const options: MagnitCollectorOptions = {
  storeCode: "780019",
  categoryId: 64247,
  pageLimit: 32,
  maximumPages: 10,
  minimumPageDelayMs: 0,
  maximumPageDelayMs: 0,
  maxAttempts: 1,
};

const logger: Logger = { log: () => Promise.resolve() };

class MemorySink implements MagnitPageSink {
  public readonly pages: MagnitCollectedPage[] = [];
  public writePage(page: MagnitCollectedPage): Promise<void> {
    this.pages.push(page);
    return Promise.resolve();
  }
}

function response(request: MagnitPageRequest, count: number, totalCount: number): MagnitPageResponse {
  return {
    requestedAt: "2026-08-17T18:00:00.000Z",
    receivedAt: "2026-08-17T18:00:00.100Z",
    durationMs: 100,
    url: "https://magnit.ru/webgate/v2/goods/search",
    status: 200,
    statusText: "OK",
    ok: true,
    retryAfter: null,
    body: {
      items: Array.from({ length: count }, (_, index) => ({ id: request.offset + index })),
      pagination: {
        hasMore: request.offset + count < totalCount,
        limit: request.limit,
        offset: request.offset,
        totalCount,
        nextOffset: null,
      },
    },
  };
}

describe("collectMagnitCategory", () => {
  it.each([403, 429])("stops immediately on HTTP %s", async (status) => {
    const fetchPage = vi.fn((request: MagnitPageRequest) => Promise.resolve({
      ...response(request, 0, 0), status, ok: false,
    }));
    await expect(collectMagnitCategory({ fetchPage }, new MemorySink(), logger, {
      ...options, maxAttempts: 3,
    })).rejects.toThrow(`HTTP ${status}`);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("retries a temporary network error with a pause", async () => {
    vi.useFakeTimers();
    try {
      const fetchPage = vi.fn<(request: MagnitPageRequest) => Promise<MagnitPageResponse>>()
        .mockRejectedValueOnce(new Error("network failed"))
        .mockImplementation((request) => Promise.resolve(response(request, 0, 0)));
      const result = collectMagnitCategory({ fetchPage }, new MemorySink(), logger, { ...options, maxAttempts: 2 });
      await vi.runAllTimersAsync();
      expect((await result).products).toHaveLength(0);
      expect(fetchPage).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects duplicated products even when totalCount matches", async () => {
    const sink = new MemorySink();
    const fetchPage = (request: MagnitPageRequest): Promise<MagnitPageResponse> => Promise.resolve({
      ...response(request, 2, 2),
      body: { items: [{ id: "same" }, { id: "same" }], pagination: { hasMore: false, limit: 32, offset: 0, totalCount: 2 } },
    });
    await expect(collectMagnitCategory({ fetchPage }, sink, logger, options)).rejects.toThrow("Повтор");
    expect(sink.pages).toHaveLength(1);
  });

  it("follows nextOffset when provided", async () => {
    const offsets: number[] = [];
    const fetchPage = (request: MagnitPageRequest): Promise<MagnitPageResponse> => {
      offsets.push(request.offset);
      return Promise.resolve({ ...response(request, 1, 2), body: {
        items: [{ id: String(request.offset) }],
        pagination: { hasMore: request.offset === 0, offset: request.offset, limit: 32, totalCount: 2, nextOffset: 10 },
      } });
    };
    await collectMagnitCategory({ fetchPage }, new MemorySink(), logger, options);
    expect(offsets).toEqual([0, 10]);
  });
  it("uses hasMore and offset pagination until all products are collected", async () => {
    const requests: MagnitPageRequest[] = [];
    const client: MagnitPageClient = {
      fetchPage(request): Promise<MagnitPageResponse> {
        requests.push(request);
        return Promise.resolve(response(request, request.offset === 0 ? 32 : 7, 39));
      },
    };
    const sink = new MemorySink();
    const result = await collectMagnitCategory(client, sink, logger, options);

    expect(requests.map(({ offset }) => offset)).toEqual([0, 32]);
    expect(result.products).toHaveLength(39);
    expect(sink.pages).toHaveLength(2);
  });

  it("rejects a silently truncated final result", async () => {
    const client: MagnitPageClient = {
      fetchPage(request): Promise<MagnitPageResponse> {
        return Promise.resolve({
          ...response(request, 5, 10),
          body: {
            items: Array.from({ length: 5 }, (_, id) => ({ id })),
            pagination: { hasMore: false, limit: 32, offset: 0, totalCount: 10 },
          },
        });
      },
    };

    await expect(
      collectMagnitCategory(client, new MemorySink(), logger, options),
    ).rejects.toBeInstanceOf(MagnitInvalidResponseError);
  });
});
