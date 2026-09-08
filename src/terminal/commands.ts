import path from "node:path";
import { spawn } from "node:child_process";
import type { RetailChain } from "../config/code-list.js";
import { loadPyaterochkaConfig } from "../config/pyaterochka-config.js";
import { loadMagnitConfig } from "../config/magnit-config.js";
import { createPyaterochkaTaskPlan } from "../scheduler/pyaterochka-plan.js";
import { createMagnitPlan } from "../scheduler/magnit/plan.js";
import { FileRunStateStore } from "../scheduler/file-run-state.js";
import { MagnitFileState } from "../scheduler/magnit/state.js";
import { selectMagnitTasks } from "../scheduler/magnit/runner.js";

export interface CollectorCommand {
  readonly chain: RetailChain;
  readonly args: readonly string[];
}

export interface CommandPreview {
  readonly chain: RetailChain;
  readonly taskCount: number;
  readonly stores: number;
  readonly categories: number;
  readonly firstTasks: readonly { storeId: string; categoryId: string }[];
}

export async function previewCommand(command: CollectorCommand, cwd: string): Promise<CommandPreview> {
  let tasks: readonly { storeId: string; categoryId: string }[];
  if (command.chain === "magnit") {
    const config = await loadMagnitConfig(command.args, {}, cwd);
    const file = config.resumeFile ?? config.retryFailedFile;
    tasks = file === null ? await createMagnitPlan(config) : selectMagnitTasks(await new MagnitFileState(file).load(), config.retryFailedFile !== null ? "retry-failed" : "resume");
  } else {
    const config = loadPyaterochkaConfig(command.args, {}, cwd);
    const file = config.resumeFile ?? config.retryFailedFile;
    tasks = file === null ? await createPyaterochkaTaskPlan(config) : (await FileRunStateStore.load(file)).state.tasks.filter((task) =>
      config.retryFailedFile !== null ? task.status === "failed" : task.status === "pending" || task.status === "running",
    );
  }
  return {
    chain: command.chain, taskCount: tasks.length,
    stores: new Set(tasks.map((task) => task.storeId)).size,
    categories: new Set(tasks.map((task) => task.categoryId)).size,
    firstTasks: tasks.slice(0, 10).map(({ storeId, categoryId }) => ({ storeId, categoryId })),
  };
}

export function collectorArguments(command: CollectorCommand, cwd: string): readonly string[] {
  return ["--import", "tsx", path.join(cwd, "src", command.chain === "magnit" ? "magnit.ts" : "index.ts"), ...command.args];
}

export async function runCollector(command: CollectorCommand, cwd: string, timeZone?: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, [...collectorArguments(command, cwd)], {
      cwd, stdio: "inherit", shell: false,
      env: timeZone === undefined ? process.env : { ...process.env, APP_TIMEZONE: timeZone },
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}
