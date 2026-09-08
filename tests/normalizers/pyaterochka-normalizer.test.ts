import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PyaterochkaProduct } from "../../src/collectors/pyaterochka/types.js";
import {
  normalizePyaterochkaProduct,
  rublesToMoney,
} from "../../src/normalizers/pyaterochka/normalizer.js";

const context = {
  storeId: "324K",
  categoryId: "251C12891",
  categoryName: "Завтраки",
  logicalDate: "2026-08-30",
  runStartedAt: "2026-08-30T14:27:06.643Z",
  collectedAt: "2026-08-30T14:27:14.000Z",
  rawReference: "data/raw/page-0001.json",
};

describe("rublesToMoney", () => {
  it.each([
    ["173.99", 17399],
    ["10.5", 1050],
    ["7", 700],
    [0, 0],
  ])("converts %s rubles to integer kopecks", (input, expected) => {
    expect(rublesToMoney(input)).toEqual({
      amountMinor: expected,
      currency: "RUB",
      minorUnitScale: 2,
    });
  });

  it("keeps an absent price as null", () => {
    expect(rublesToMoney(null)).toBeNull();
  });

  it("rejects ambiguous fractional precision", () => {
    expect(() => rublesToMoney("10.999")).toThrow("Некорректная цена");
  });
});

describe("normalizePyaterochkaProduct", () => {
  it("normalizes every product from the coursework sample", async () => {
    const samplePath = path.resolve(
      "samples",
      "pyaterochka",
      "5ka_324K_251C12891_2026-08-06.json",
    );
    const products = JSON.parse(await readFile(samplePath, "utf8")) as PyaterochkaProduct[];

    const snapshots = products.map((product) => normalizePyaterochkaProduct(product, context));

    expect(snapshots).toHaveLength(26);
    expect(snapshots[0]).toMatchObject({
      chain: "pyaterochka",
      storeId: "324K",
      categoryId: "251C12891",
      productId: "58625",
      regularPrice: { amountMinor: 17399, currency: "RUB", minorUnitScale: 2 },
      discountPrice: null,
      available: true,
      unit: "шт",
      logicalDate: "2026-08-30",
    });
  });

  it("does not silently accept a product without an identifier", () => {
    expect(() => normalizePyaterochkaProduct({ name: "Без кода" }, context)).toThrow("plu");
  });
});
