import { readdir } from "node:fs/promises";
import path from "node:path";
import { FileRunStateStore } from "../scheduler/file-run-state.js";
import { MagnitFileState } from "../scheduler/magnit/state.js";

export interface RunSummary {
  readonly file: string;
  readonly chain: string;
  readonly status: string;
  readonly updatedAt: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly error?: string;
}

export async function listRunSummaries(stateDirectory: string): Promise<readonly RunSummary[]> {
  const summaries: RunSummary[] = [];
  for (const chain of ["pyaterochka", "magnit"] as const) {
    const directory = path.join(stateDirectory, chain);
    let names: string[];
    try { names = await readdir(directory); } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    for (const name of names.filter((name) => name.endsWith(".json"))) {
      const file = path.join(directory, name);
      try {
        const run = chain === "magnit" ? await new MagnitFileState(file).load() : (await FileRunStateStore.load(file)).state;
        const counts: Record<string, number> = {};
        for (const task of run.tasks) counts[task.status] = (counts[task.status] ?? 0) + 1;
        summaries.push({ file, chain, status: run.status, updatedAt: run.updatedAt, counts });
      } catch (error) {
        summaries.push({ file, chain, status: "invalid", updatedAt: "", counts: {}, error: error instanceof Error ? error.message : "Ошибка чтения" });
      }
    }
  }
  return summaries.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
