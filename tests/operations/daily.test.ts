import { mkdtemp, readFile, readdir, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runDaily, type DailyDependencies } from "../../src/operations/daily-runner.js";
import { readDailyConfig, type DailyConfig } from "../../src/operations/daily-config.js";

const directories: string[] = [];
const config: DailyConfig = { version: 1, timeZone: "Europe/Moscow", jobs: [
  { chain: "pyaterochka", args: [] }, { chain: "magnit", args: [] },
] };

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "retail-daily-test-")); directories.push(directory); return directory;
}

function dependencies(): DailyDependencies {
  return {
    preview: vi.fn<DailyDependencies["preview"]>().mockImplementation((command) => Promise.resolve({
      chain: command.chain, taskCount: 1, stores: 1, categories: 1, firstTasks: [],
    })),
    run: vi.fn<DailyDependencies["run"]>().mockResolvedValue(0),
  };
}

afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe("daily runner", () => {
  it("executes the actual CLI in its default preview mode without creating state", async () => {
    const cwd = await temporaryDirectory();
    const stores = path.join(cwd, "stores.json");
    const categories = path.join(cwd, "categories.txt");
    const daily = path.join(cwd, "daily.json");
    await writeFile(stores, JSON.stringify([{ chain: "magnit", externalCode: "000001", active: true }]));
    await writeFile(categories, "100\n");
    await writeFile(daily, JSON.stringify({ version: 1, timeZone: "Europe/Moscow", jobs: [
      { chain: "magnit", storesFile: stores, categoriesFile: categories },
    ] }));
    const { stdout } = await promisify(execFile)(process.execPath, ["--import", "tsx", path.resolve("src/daily.ts"), "--config", daily], {
      cwd: process.cwd(), env: { ...process.env, STATE_DATA_DIR: path.join(cwd, "state") }, timeout: 15000,
    });
    expect(JSON.parse(stdout) as unknown).toMatchObject({ status: "preview", plans: [{ taskCount: 1, stores: 1 }] });
    expect((await readdir(cwd)).sort()).toEqual(["categories.txt", "daily.json", "stores.json"]);
  });
  it("defaults to preview without creating files or running collectors", async () => {
    const cwd = await temporaryDirectory(); const deps = dependencies();
    expect((await runDaily(config, cwd, false, path.join(cwd, "state"), deps)).status).toBe("preview");
    expect(await readdir(cwd)).toEqual([]);
    expect(deps.run).not.toHaveBeenCalled();
  });
  it("runs chains in order and never repeats a date", async () => {
    const cwd = await temporaryDirectory(); const deps = dependencies();
    const first = await runDaily(config, cwd, true, path.join(cwd, "state"), deps);
    expect(first.status).toBe("completed");
    expect(deps.run).toHaveBeenNthCalledWith(1, config.jobs[0], cwd);
    expect(deps.run).toHaveBeenNthCalledWith(2, config.jobs[1], cwd);
    expect((await runDaily(config, cwd, true, path.join(cwd, "state"), deps)).status).toBe("skipped");
    expect(deps.run).toHaveBeenCalledTimes(2);
    expect((await readdir(path.join(cwd, "state"))).some((file) => file.endsWith(".lock"))).toBe(false);
  });
  it("stops after a nonzero exit and records the failure", async () => {
    const cwd = await temporaryDirectory(); const deps = dependencies();
    vi.mocked(deps.run).mockResolvedValue(1);
    const result = await runDaily(config, cwd, true, path.join(cwd, "state"), deps);
    expect(result.status).toBe("failed");
    expect(deps.run).toHaveBeenCalledTimes(1);
    expect(await readFile(result.reportPath!, "utf8")).toContain('"exitCode": 1');
  });
  it("does not launch anything if any input plan is invalid", async () => {
    const cwd = await temporaryDirectory(); const deps = dependencies();
    vi.mocked(deps.preview).mockRejectedValueOnce(new Error("bad input"));
    await expect(runDaily(config, cwd, true, path.join(cwd, "state"), deps)).rejects.toThrow("bad input");
    expect(deps.run).not.toHaveBeenCalled();
  });
  it("respects an existing lock and does not delete it", async () => {
    const cwd = await temporaryDirectory(); const deps = dependencies();
    const state = path.join(cwd, "state"); await mkdir(state);
    await writeFile(path.join(state, "active.lock"), "test owner");
    await expect(runDaily(config, cwd, true, state, deps)).rejects.toThrow("активен или прерван");
    expect(await readFile(path.join(state, "active.lock"), "utf8")).toBe("test owner");
    expect(deps.run).not.toHaveBeenCalled();
  });
  it("builds safe commands from config without arbitrary scripts", async () => {
    const cwd = await temporaryDirectory(); const file = path.join(cwd, "daily.json");
    await writeFile(file, JSON.stringify({ version: 1, timeZone: "Europe/Moscow", jobs: [
      { chain: "magnit", storesFile: "my stores.json", categoriesFile: "categories.txt" },
    ] }));
    const parsed = await readDailyConfig(file, cwd);
    expect(parsed.jobs[0]?.args).toEqual(["--batch", "--stores-file", path.join(cwd, "my stores.json"), "--categories-file", path.join(cwd, "categories.txt"), "--headless"]);
  });
});
