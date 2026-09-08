import { randomUUID } from "node:crypto";
import { mkdir, open, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { logicalDate } from "../core/time.js";
import { previewCommand, runCollector, type CollectorCommand, type CommandPreview } from "../terminal/commands.js";
import type { DailyConfig } from "./daily-config.js";

export interface DailyResult {
  readonly status: "preview" | "completed" | "failed" | "skipped";
  readonly plans: readonly CommandPreview[];
  readonly reportPath?: string;
}

export interface DailyDependencies {
  preview(this: void, command: CollectorCommand, cwd: string): Promise<CommandPreview>;
  run(this: void, command: CollectorCommand, cwd: string): Promise<number>;
}

/** Does not install timers or change Windows settings. Invoke once from a scheduler. */
export async function runDaily(
  config: DailyConfig, cwd: string, execute: boolean,
  stateDirectory = path.resolve(cwd, "data/state/daily"),
  dependencies: DailyDependencies = { preview: previewCommand, run: (command, directory) => runCollector(command, directory, config.timeZone) },
): Promise<DailyResult> {
  const plans: CommandPreview[] = [];
  for (const job of config.jobs) plans.push(await dependencies.preview(job, cwd));
  if (!execute) return { status: "preview", plans };
  await mkdir(stateDirectory, { recursive: true });
  const lockPath = path.join(stateDirectory, "active.lock");
  let lock;
  try { lock = await open(lockPath, "wx"); } catch (error) {
    if (hasCode(error, "EEXIST")) throw new Error(`Ежедневный запуск уже активен или прерван: ${lockPath}. Не удаляйте блокировку, пока процесс работает.`);
    throw error;
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    await lock.sync();
    const date = logicalDate(new Date().toISOString(), config.timeZone);
    const reportPath = path.join(stateDirectory, `${date}.json`);
    const report: {
      date: string; timeZone: string; startedAt: string; finishedAt: string | null;
      status: string; jobs: { chain: string; exitCode: number | null; error?: string }[];
    } = {
      date, timeZone: config.timeZone, startedAt: new Date().toISOString(), finishedAt: null,
      status: "running", jobs: config.jobs.map(({ chain }) => ({ chain, exitCode: null })),
    };
    try {
      await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx", flush: true });
    } catch (error) {
      if (hasCode(error, "EEXIST")) return { status: "skipped", plans, reportPath };
      throw error;
    }
    for (const [index, job] of config.jobs.entries()) {
      const outcome = report.jobs[index];
      if (outcome === undefined) throw new Error("Некорректный daily plan");
      try { outcome.exitCode = await dependencies.run(job, cwd); } catch (error) {
        outcome.exitCode = 1;
        outcome.error = error instanceof Error ? error.message : "Ошибка запуска";
      }
      if (outcome.exitCode !== 0) report.status = "failed";
      await saveReport(reportPath, report);
      if (report.status === "failed") break;
    }
    report.status = report.status === "failed" ? "failed" : "completed";
    report.finishedAt = new Date().toISOString();
    await saveReport(reportPath, report);
    return { status: report.status === "failed" ? "failed" : "completed", plans, reportPath };
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

async function saveReport(file: string, value: unknown): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx", flush: true });
  await rename(temporary, file);
}
