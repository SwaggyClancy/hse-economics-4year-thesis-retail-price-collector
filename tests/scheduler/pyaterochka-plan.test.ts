import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadPyaterochkaConfig } from "../../src/config/pyaterochka-config.js";
import { createPyaterochkaTaskPlan } from "../../src/scheduler/pyaterochka-plan.js";

const temporaryDirectories: string[] = [];

afterEach(async (): Promise<void> => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("createPyaterochkaTaskPlan", () => {
  it("creates a sequential plan from unique active stores and categories", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "retail-plan-test-"));
    temporaryDirectories.push(directory);
    const storesFile = path.join(directory, "stores.json");
    const categoriesFile = path.join(directory, "categories.json");
    await writeFile(
      storesFile,
      JSON.stringify([
        { code: "324k", active: true },
        { code: "324K", active: true },
        { code: "L718", active: false },
        { code: "Q334" },
      ]),
      "utf8",
    );
    await writeFile(
      categoriesFile,
      JSON.stringify([
        { code: "251C12891", active: true },
        { code: "251C13093", active: true },
      ]),
      "utf8",
    );
    const config = loadPyaterochkaConfig(
      ["--batch", "--stores-file", storesFile, "--categories-file", categoriesFile],
      {},
      directory,
    );

    const tasks = await createPyaterochkaTaskPlan(config);

    expect(tasks).toEqual([
      { storeId: "324K", categoryId: "251C12891" },
      { storeId: "324K", categoryId: "251C13093" },
      { storeId: "Q334", categoryId: "251C12891" },
      { storeId: "Q334", categoryId: "251C13093" },
    ]);
  });
});
