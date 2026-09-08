import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadMagnitConfig } from "../../src/config/magnit-config.js";

describe("Magnit safe single-task config", () => {
  it("requires explicit store and category", async () => {
    await expect(loadMagnitConfig([], {}, process.cwd())).rejects.toThrow("один магазин");
  });
  it("supports -- separator, headless and separate profile", async () => {
    const config = await loadMagnitConfig(["--", "--store", "011601", "--category", "64247", "--headless"], {}, process.cwd());
    expect(config.storeCode).toBe("011601");
    expect(config.categoryId).toBe(64247);
    expect(config.headless).toBe(true);
    expect(config.profileDirectory).toBe(path.resolve("profiles/magnit"));
  });
  it("requires explicit input files for a batch", async () => {
    await expect(loadMagnitConfig(["--batch"], {}, process.cwd())).rejects.toThrow();
  });
  it.each([
    ["--resume", "state.json", "--retry-failed", "other.json"],
    ["--batch", "--store", "780019"],
    ["--resume", "state.json", "--category", "64247"],
    ["--setup-profile", "--dry-run"],
  ])("rejects conflicting mode arguments %j", async (...args) => {
    await expect(loadMagnitConfig(args, {}, process.cwd())).rejects.toThrow();
  });
  it.each(["-1", "64247.1", "9007199254740993", "abc"]) ("rejects category %s", async (category) => {
    await expect(loadMagnitConfig(["--store", "780019", "--category", category], {}, process.cwd())).rejects.toThrow();
  });
  it("allows profile setup without a collection", async () => {
    expect((await loadMagnitConfig(["--setup-profile"], {}, process.cwd())).setupProfile).toBe(true);
    await expect(loadMagnitConfig(["--setup-profile", "--headless"], {}, process.cwd())).rejects.toThrow();
  });
});
