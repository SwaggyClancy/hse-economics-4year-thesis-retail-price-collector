import { describe, expect, it } from "vitest";
import { buildMagnitRequestBody, MAGNIT_SEARCH_URL } from "../../src/browser/magnit-page-client.js";

describe("Magnit page client", () => {
  it("builds the confirmed goods search request", () => {
    expect(MAGNIT_SEARCH_URL).toBe("https://magnit.ru/webgate/v2/goods/search");
    expect(buildMagnitRequestBody({
      storeCode: "780019",
      categoryId: 64247,
      limit: 32,
      offset: 64,
    })).toEqual({
      sort: { order: "desc", type: "popularity" },
      pagination: { limit: 32, offset: 64 },
      categories: [64247],
      includeAdultGoods: true,
      storeCode: "780019",
      storeType: "1",
      catalogType: "1",
    });
  });
});
