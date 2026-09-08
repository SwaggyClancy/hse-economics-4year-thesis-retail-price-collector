import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadPyaterochkaConfig } from "../../src/config/pyaterochka-config.js";

describe("loadPyaterochkaConfig", () => {
  it("supports dry-run with the package-manager separator", () => {
    expect(loadPyaterochkaConfig(["--", "--dry-run"], {}, process.cwd()).dryRun).toBe(true);
  });
  it("uses coursework test codes by default", () => {
    const config = loadPyaterochkaConfig([], {}, "C:\\project");

    expect(config.storeId).toBe("3448");
    expect(config.categoryId).toBe("251C12887");
    expect(config.browserChannel).toBe("chrome");
    expect(config.setupProfile).toBe(false);
    expect(config.profileDirectory).toBe(path.resolve("C:\\project", "profiles", "pyaterochka"));
  });

  it("allows CLI values to override environment values", () => {
    const config = loadPyaterochkaConfig(
      [
        "--store",
        "l718",
        "--category",
        "251C13093",
        "--headless",
        "--browser-channel",
        "chromium",
      ],
      { PYATEROCHKA_STORE: "Q334", PYATEROCHKA_CATEGORY: "251C12886" },
      process.cwd(),
    );

    expect(config.storeId).toBe("L718");
    expect(config.categoryId).toBe("251C13093");
    expect(config.headless).toBe(true);
    expect(config.browserChannel).toBe("chromium");
  });

  it("supports the one-time profile setup mode", () => {
    const config = loadPyaterochkaConfig(["--setup-profile"], {}, process.cwd());

    expect(config.setupProfile).toBe(true);
    expect(config.headless).toBe(false);
  });
});
