import { describe, expect, it } from "vitest";
import { buildProductsUrl } from "../../src/browser/pyaterochka-page-client.js";

describe("buildProductsUrl", () => {
  it("builds the confirmed catalog endpoint and pagination parameters", () => {
    const url = new URL(
      buildProductsUrl({ storeId: "3448", categoryId: "251C12887", limit: 12, offset: 24 }),
    );

    expect(url.origin).toBe("https://5d.5ka.ru");
    expect(url.pathname).toBe(
      "/api/catalog/v2/stores/3448/categories/251C12887/products",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      mode: "delivery",
      include_restrict: "true",
      limit: "12",
      offset: "24",
    });
  });
});
