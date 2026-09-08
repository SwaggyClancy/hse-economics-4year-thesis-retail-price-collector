import type { PyaterochkaPageClient } from "../../browser/pyaterochka-page-client.js";
import type { Logger } from "../../core/logger.js";
import { errorDetails } from "../../core/logger.js";
import { withRetry } from "../../core/retry.js";
import { delay, randomInteger } from "../../core/time.js";
import { HttpResponseError, InvalidResponseError, isRetryableCollectionError } from "./errors.js";
import type {
  CollectedPage,
  CollectionResult,
  PyaterochkaPageEnvelope,
  PyaterochkaProduct,
} from "./types.js";

export interface PageSink {
  writePage(page: CollectedPage): Promise<void>;
}

export interface CollectorOptions {
  readonly storeId: string;
  readonly categoryId: string;
  readonly pageLimit: number;
  readonly maximumPages: number;
  readonly minimumPageDelayMs: number;
  readonly maximumPageDelayMs: number;
  readonly maxAttempts: number;
}

export async function collectPyaterochkaCategory(
  client: PyaterochkaPageClient,
  sink: PageSink,
  logger: Logger,
  options: CollectorOptions,
): Promise<CollectionResult> {
  const startedAt = new Date().toISOString();
  const pages: CollectedPage[] = [];
  const products: PyaterochkaProduct[] = [];

  for (let pageIndex = 0; pageIndex < options.maximumPages; pageIndex += 1) {
    const pageNumber = pageIndex + 1;
    const offset = pageIndex * options.pageLimit;
    const response = await withRetry(
      async () => {
        const result = await client.fetchPage({
          storeId: options.storeId,
          categoryId: options.categoryId,
          limit: options.pageLimit,
          offset,
        });
        if (!result.ok) throw new HttpResponseError(result.status, result.statusText, result.retryAfter);
        return result;
      },
      {
        maxAttempts: options.maxAttempts,
        initialDelayMs: 2000,
        maximumDelayMs: 30000,
        shouldRetry: isRetryableCollectionError,
        onRetry: async ({ attempt, delayMs, error }) => {
          await logger.log("warn", "pyaterochka.request.retry", {
            storeId: options.storeId,
            categoryId: options.categoryId,
            offset,
            failedAttempt: attempt,
            nextDelayMs: delayMs,
            ...errorDetails(error),
          });
        },
      },
    );

    const envelope = parseEnvelope(response.body);
    const collectedPage: CollectedPage = {
      pageNumber,
      offset,
      requestedAt: response.requestedAt,
      receivedAt: response.receivedAt,
      durationMs: response.durationMs,
      url: response.url,
      envelope,
    };
    await sink.writePage(collectedPage);
    pages.push(collectedPage);
    products.push(...envelope.products);

    await logger.log("info", "pyaterochka.page.collected", {
      storeId: options.storeId,
      categoryId: options.categoryId,
      pageNumber,
      offset,
      productCount: envelope.products.length,
      durationMs: response.durationMs,
    });

    if (envelope.products.length < options.pageLimit) {
      return {
        storeId: options.storeId,
        categoryId: options.categoryId,
        startedAt,
        finishedAt: new Date().toISOString(),
        pages,
        products,
      };
    }

    const pageDelay = randomInteger(options.minimumPageDelayMs, options.maximumPageDelayMs);
    await delay(pageDelay);
  }

  throw new InvalidResponseError(`Достигнут предел ${options.maximumPages} страниц`);
}

function parseEnvelope(body: unknown): PyaterochkaPageEnvelope {
  if (typeof body !== "object" || body === null || !("products" in body)) {
    throw new InvalidResponseError("Ответ Пятёрочки не содержит поле products");
  }

  const products = body.products;
  if (!Array.isArray(products)) {
    throw new InvalidResponseError("Поле products в ответе Пятёрочки не является массивом");
  }

  return body as PyaterochkaPageEnvelope;
}
