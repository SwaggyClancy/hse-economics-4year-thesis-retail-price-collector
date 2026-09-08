import { describe, expect, it } from "vitest";
import { parseCodeList } from "../../src/config/code-list.js";

describe("code list adapter", () => {
  it("preserves leading zeroes, removes BOM, blank lines and duplicates", () => {
    expect(parseCodeList("\uFEFF011601\r\n012333\r\n011601\r\n\r\n", true)).toEqual(["011601", "012333"]);
  });
  it("accepts discovery JSON without importing discovery modules", () => {
    expect(parseCodeList(JSON.stringify([
      { chain: "magnit", externalCode: "011601", active: true, address: "Адрес" },
      { chain: "magnit", externalCode: "012333", active: false },
    ]), false, "magnit")).toEqual(["011601"]);
  });
  it("accepts legacy configuration", () => {
    expect(parseCodeList('[{"code":"324k"},{"code":"324K"}]', false)).toEqual(["324K"]);
  });
  it.each(['[null]', '[123]', '[{}]', '[{"code":"../escape"}]', '[]', '[{"code":"x","active":"false"}]']) (
    "rejects malformed data: %s", (value) => {
      expect(() => parseCodeList(value, false)).toThrow();
    },
  );
  it("rejects a different chain", () => {
    expect(() => parseCodeList('[{"chain":"magnit","externalCode":"1"}]', false, "pyaterochka")).toThrow("другой сети");
  });
});
