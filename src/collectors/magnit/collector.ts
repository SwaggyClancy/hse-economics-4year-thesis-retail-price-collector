import type { MagnitPageClient } from "../../browser/magnit-page-client.js";
import { errorDetails, type Logger } from "../../core/logger.js";
import { withRetry } from "../../core/retry.js";
import { delay, randomInteger } from "../../core/time.js";
import {
  isRetryableMagnitError,
  MagnitHttpResponseError,
  MagnitInvalidResponseError,
} from "./errors.js";
import type {
  MagnitCollectedPage,
  MagnitCollectionResult,
  MagnitPageEnvelope,
  MagnitPagination,
  MagnitProduct,
} from "./types.js";

export interface MagnitPageSink {
  writePage(page: MagnitCollectedPage): Promise<void>;
}

export interface MagnitCollectorOptions {
  readonly storeCode: string;
  readonly categoryId: number;
  readonly pageLimit: number;
  readonly maximumPages: number;
  readonly minimumPageDelayMs: number;
  readonly maximumPageDelayMs: number;
  readonly maxAttempts: number;
}

export async function collectMagnitCategory(
  client: MagnitPageClient,
  sink: MagnitPageSink,
  logger: Logger,
  options: MagnitCollectorOptions,
): Promise<MagnitCollectionResult> {
  const startedAt = new Date().toISOString();
  const pages: MagnitCollectedPage[] = [];
  const products: MagnitProduct[] = [];
  const seenIds = new Set<string>();
  let offset = 0;

  for (let pageIndex = 0; pageIndex < options.maximumPages; pageIndex += 1) {
    const pageNumber = pageIndex + 1;
    const response = await withRetry(
      async () => {
        const value = await client.fetchPage({
          storeCode: options.storeCode,
          categoryId: options.categoryId,
          limit: options.pageLimit,
          offset,
        });
        if (!value.ok) {
          throw new MagnitHttpResponseError(value.status, value.statusText, value.retryAfter);
        }
        return value;
      },
      {
        maxAttempts: options.maxAttempts,
        initialDelayMs: 2000,
        maximumDelayMs: 30000,
        shouldRetry: isRetryableMagnitError,
        onRetry: async ({ attempt, delayMs, error }) => {
          await logger.log("warn", "magnit.request.retry", {
            storeCode: options.storeCode,
            categoryId: options.categoryId,
            offset,
            failedAttempt: attempt,
            nextDelayMs: delayMs,
            ...errorDetails(error),
          });
        },
      },
    );

    const envelope = parseMagnitEnvelope(response.body);
    const page: MagnitCollectedPage = {
      pageNumber,
      offset,
      requestedAt: response.requestedAt,
      receivedAt: response.receivedAt,
      durationMs: response.durationMs,
      url: response.url,
      envelope,
    };
    await sink.writePage(page);
    if (envelope.pagination.offset !== offset || envelope.pagination.limit !== options.pageLimit) {
      throw new MagnitInvalidResponseError("Магнит вернул offset/limit, не совпадающие с запросом");
    }
    for (const product of envelope.items) {
      if (!isObject(product)) throw new MagnitInvalidResponseError("Некорректный товар в items");
      const id = product.id ?? product.productId;
      if ((typeof id !== "string" && typeof id !== "number") || String(id) === "") {
        throw new MagnitInvalidResponseError("Товар не содержит id");
      }
      if (seenIds.has(String(id))) throw new MagnitInvalidResponseError("Повтор товара в пагинации Магнита");
      seenIds.add(String(id));
    }
    pages.push(page);
    products.push(...envelope.items);

    await logger.log("info", "magnit.page.collected", {
      storeCode: options.storeCode,
      categoryId: options.categoryId,
      pageNumber,
      offset,
      productCount: envelope.items.length,
      totalCount: envelope.pagination.totalCount,
      durationMs: response.durationMs,
    });

    if (!envelope.pagination.hasMore) {
      if (products.length !== envelope.pagination.totalCount) {
        throw new MagnitInvalidResponseError(
          `Собрано ${products.length} товаров, API Магнита сообщил ${envelope.pagination.totalCount}`,
        );
      }
      return {
        storeCode: options.storeCode,
        categoryId: options.categoryId,
        startedAt,
        finishedAt: new Date().toISOString(),
        pages,
        products,
      };
    }

    if (envelope.items.length === 0) throw new MagnitInvalidResponseError("Пустая страница с hasMore=true");
    const nextOffset = envelope.pagination.nextOffset ?? offset + options.pageLimit;
    if (!isNonNegativeInteger(nextOffset) || nextOffset <= offset) {
      throw new MagnitInvalidResponseError("Некорректный nextOffset Магнита");
    }
    offset = nextOffset;
    if (pageNumber < options.maximumPages) {
      await delay(randomInteger(options.minimumPageDelayMs, options.maximumPageDelayMs));
    }
  }
  throw new MagnitInvalidResponseError(`Достигнут предел ${options.maximumPages} страниц`);
}

export function parseMagnitEnvelope(body: unknown): MagnitPageEnvelope {
  if (!isObject(body) || !Array.isArray(body.items) || !isPagination(body.pagination)) {
    throw new MagnitInvalidResponseError("Ответ Магнита не содержит корректные items и pagination");
  }
  return body as MagnitPageEnvelope;
}

function isPagination(value: unknown): value is MagnitPagination {
  return isObject(value) &&
    typeof value.hasMore === "boolean" &&
    isNonNegativeInteger(value.limit) &&
    isNonNegativeInteger(value.offset) &&
    isNonNegativeInteger(value.totalCount);
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
