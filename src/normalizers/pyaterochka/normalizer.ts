import path from "node:path";
import { rawPageFilename } from "../../collectors/pyaterochka/raw-storage.js";
import type {
  CollectionResult,
  PyaterochkaProduct,
} from "../../collectors/pyaterochka/types.js";
import type { Money, ProductSnapshot } from "../../core/product-snapshot.js";
import { logicalDate } from "../../core/time.js";

interface PriceFields {
  readonly regular?: unknown;
  readonly discount?: unknown;
}

interface RatingFields {
  readonly rating_average?: unknown;
  readonly rates_count?: unknown;
}

export function normalizePyaterochkaCollection(
  result: CollectionResult,
  rawRunDirectory: string,
  projectDirectory: string,
  timeZone: string,
): readonly ProductSnapshot[] {
  return result.pages.flatMap((page) => {
    const rawReference = path.relative(
      projectDirectory,
      path.join(rawRunDirectory, rawPageFilename(page)),
    );
    return page.envelope.products.map((product) =>
      normalizePyaterochkaProduct(product, {
        storeId: result.storeId,
        categoryId: result.categoryId,
        categoryName: stringOrNull(page.envelope.name),
        runStartedAt: result.startedAt,
        collectedAt: page.receivedAt,
        logicalDate: logicalDate(result.startedAt, timeZone),
        rawReference,
      }),
    );
  });
}

interface ProductContext {
  readonly storeId: string;
  readonly categoryId: string;
  readonly categoryName: string | null;
  readonly runStartedAt: string;
  readonly collectedAt: string;
  readonly logicalDate: string;
  readonly rawReference: string;
}

export function normalizePyaterochkaProduct(
  product: PyaterochkaProduct,
  context: ProductContext,
): ProductSnapshot {
  const productId = product.plu;
  if ((typeof productId !== "string" && typeof productId !== "number") || String(productId) === "") {
    throw new Error("Товар Пятёрочки не содержит корректный plu");
  }
  if (typeof product.name !== "string" || product.name.trim() === "") {
    throw new Error(`Товар Пятёрочки ${String(productId)} не содержит название`);
  }

  const prices = objectOrEmpty(product.prices) as PriceFields;
  const rating = objectOrEmpty(product.rating) as RatingFields;

  return {
    chain: "pyaterochka",
    storeId: context.storeId,
    categoryId: context.categoryId,
    categoryName: context.categoryName,
    productId: String(productId),
    name: product.name,
    logicalDate: context.logicalDate,
    runStartedAt: context.runStartedAt,
    collectedAt: context.collectedAt,
    regularPrice: rublesToMoney(prices.regular),
    discountPrice: rublesToMoney(prices.discount),
    available: product.is_available === true,
    unit: stringOrNull(product.uom),
    propertyClarification: stringOrNull(product.property_clarification),
    stockLimit: stringOrNull(product.stock_limit),
    rating: finiteNumberOrNull(rating.rating_average),
    ratingCount: finiteNumberOrNull(rating.rates_count),
    rawReference: context.rawReference,
  };
}

export function rublesToMoney(value: unknown): Money | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error("Цена Пятёрочки должна быть строкой или числом");
  }
  const normalized = value.toString().replace(",", ".");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (match === null) throw new Error(`Некорректная цена Пятёрочки: ${normalized}`);
  const rubles = Number(match[1]);
  const kopecks = Number((match[2] ?? "").padEnd(2, "0"));
  const amountMinor = rubles * 100 + kopecks;
  if (!Number.isSafeInteger(amountMinor)) throw new Error(`Цена вне допустимого диапазона: ${normalized}`);
  return { amountMinor, currency: "RUB", minorUnitScale: 2 };
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
