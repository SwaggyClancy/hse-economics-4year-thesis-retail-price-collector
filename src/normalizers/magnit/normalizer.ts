import path from "node:path";
import { magnitRawPageFilename } from "../../collectors/magnit/raw-storage.js";
import type { MagnitCollectionResult, MagnitProduct } from "../../collectors/magnit/types.js";
import type { Money, ProductSnapshot } from "../../core/product-snapshot.js";
import { logicalDate } from "../../core/time.js";

export function normalizeMagnitCollection(
  result: MagnitCollectionResult,
  rawRunDirectory: string,
  projectDirectory: string,
  timeZone: string,
): readonly ProductSnapshot[] {
  return result.pages.flatMap((page) => {
    const rawReference = path.relative(
      projectDirectory,
      path.join(rawRunDirectory, magnitRawPageFilename(page)),
    );
    return page.envelope.items.map((product) => normalizeMagnitProduct(product, {
      storeCode: result.storeCode,
      categoryId: result.categoryId,
      runStartedAt: result.startedAt,
      collectedAt: page.receivedAt,
      logicalDate: logicalDate(result.startedAt, timeZone),
      rawReference,
    }));
  });
}

interface MagnitProductContext {
  readonly storeCode: string;
  readonly categoryId: number;
  readonly runStartedAt: string;
  readonly collectedAt: string;
  readonly logicalDate: string;
  readonly rawReference: string;
}

export function normalizeMagnitProduct(
  product: MagnitProduct,
  context: MagnitProductContext,
): ProductSnapshot {
  const productId = product.id ?? product.productId;
  if ((typeof productId !== "string" && typeof productId !== "number") || String(productId) === "") {
    throw new Error("Товар Магнита не содержит корректный id");
  }
  if (typeof product.name !== "string" || product.name.trim() === "") {
    throw new Error(`Товар Магнита ${String(productId)} не содержит название`);
  }
  const promotion = objectOrEmpty(product.promotion);
  const ratings = objectOrEmpty(product.ratings);
  const weighted = objectOrEmpty(product.weighted);
  const currentPrice = kopecksToMoney(product.price);
  const promotionPrice = promotion.isPromotion === true && promotion.oldPrice != null;

  return {
    chain: "magnit",
    storeId: context.storeCode,
    categoryId: String(context.categoryId),
    categoryName: null,
    productId: String(productId),
    name: product.name,
    logicalDate: context.logicalDate,
    runStartedAt: context.runStartedAt,
    collectedAt: context.collectedAt,
    regularPrice: promotionPrice ? kopecksToMoney(promotion.oldPrice) : currentPrice,
    discountPrice: promotionPrice ? currentPrice : null,
    available: finiteNumberOrNull(product.quantity) !== null && Number(product.quantity) > 0,
    // price is the shelf portion price; unitPrice is a different, per-unit amount.
    unit: weighted.isWeighted === true ? stringOrNull(weighted.shelfLabel) : "шт",
    propertyClarification: stringOrNull(weighted.shelfLabel),
    stockLimit: finiteNumberOrNull(product.quantity)?.toString() ?? null,
    rating: finiteNumberOrNull(ratings.rating),
    ratingCount: finiteNumberOrNull(ratings.scoresCount),
    rawReference: context.rawReference,
  };
}

export function kopecksToMoney(value: unknown): Money | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("Некорректная цена Магнита: ожидалось неотрицательное целое число копеек");
  }
  return { amountMinor: value, currency: "RUB", minorUnitScale: 2 };
}

function objectOrEmpty(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null ? value as Readonly<Record<string, unknown>> : {};
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
