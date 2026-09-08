import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { MagnitProduct } from "../../src/collectors/magnit/types.js";
import { kopecksToMoney, normalizeMagnitProduct } from "../../src/normalizers/magnit/normalizer.js";

const context = {
  storeCode: "780019",
  categoryId: 64247,
  logicalDate: "2026-08-17",
  runStartedAt: "2026-08-17T18:00:00.000Z",
  collectedAt: "2026-08-17T18:00:00.100Z",
  rawReference: "data/raw/page-0001.json",
};

describe("kopecksToMoney", () => {
  it("keeps Magnit integer prices in minor currency units", () => {
    expect(kopecksToMoney(15999)).toEqual({
      amountMinor: 15999,
      currency: "RUB",
      minorUnitScale: 2,
    });
  });

  it("rejects fractional prices", () => {
    expect(() => kopecksToMoney(159.99)).toThrow("Некорректная цена");
  });
});

describe("normalizeMagnitProduct", () => {
  it("normalizes the coursework sample and interprets oldPrice as the former price", async () => {
    const samplePath = path.resolve("samples", "magnit", "magnit_780019_64247_2026-08-06.json");
    const products = JSON.parse(await readFile(samplePath, "utf8")) as MagnitProduct[];
    const snapshots = products.map((product) => normalizeMagnitProduct(product, context));

    expect(snapshots).toHaveLength(34);
    expect(snapshots[0]).toMatchObject({
      chain: "magnit",
      storeId: "780019",
      categoryId: "64247",
      productId: "8000115951",
      regularPrice: { amountMinor: 21999 },
      discountPrice: { amountMinor: 15999 },
      available: true,
      logicalDate: "2026-08-17",
    });
    expect(snapshots[1]).toMatchObject({
      regularPrice: { amountMinor: 28798 },
      unit: "1.20кг",
    });
  });

  it("uses the current price as regular when no old price exists", () => {
    expect(normalizeMagnitProduct({
      id: "1",
      name: "Товар",
      price: 10000,
      promotion: { isPromotion: true, oldPrice: null },
      quantity: 0,
    }, context)).toMatchObject({
      regularPrice: { amountMinor: 10000 },
      discountPrice: null,
      available: false,
    });
  });
});
