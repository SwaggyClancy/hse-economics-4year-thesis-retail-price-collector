import { readdir, readFile, realpath, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { listRunSummaries, type RunSummary } from "../terminal/status.js";
import { inspectNormalized, addIssue, compareCounts, type FileQuality } from "./inspect.js";

export interface QualityReport {
  readonly generatedAt: string;
  readonly files: readonly FileQuality[];
  readonly runs: readonly RunSummary[];
  readonly failureFiles: readonly string[];
  readonly notes: readonly string[];
  readonly summary: { files: number; rowsAcrossFiles: number; errors: number; warnings: number; failedTasks: number; unfinishedTasks: number };
}

export async function buildQualityReport(cwd: string): Promise<QualityReport> {
  const notes: string[] = [];
  const normalized = path.resolve(cwd, "data/normalized");
  const raw = path.resolve(cwd, "data/raw");
  const files: FileQuality[] = [];
  for (const file of await findJson(normalized)) {
    let result: FileQuality;
    try { result = inspectNormalized(path.relative(cwd, file), JSON.parse(await readFile(file, "utf8")) as unknown); }
    catch {
      result = { file: path.relative(cwd, file), rows: 0, issues: [], rawReferences: [], identity: null, runStartedAt: null };
      addIssue(result.issues, "UNREADABLE_JSON", "error");
    }
    for (const reference of result.rawReferences) {
      const target = path.resolve(cwd, reference);
      if (!within(raw, target)) { addIssue(result.issues, "RAW_OUTSIDE_ROOT", "error"); continue; }
      try {
        if (!within(await realpath(raw), await realpath(target))) addIssue(result.issues, "RAW_OUTSIDE_ROOT", "error");
        else if (!(await stat(target)).isFile()) addIssue(result.issues, "RAW_NOT_A_FILE", "error");
      } catch { addIssue(result.issues, "RAW_NOT_FOUND", "error"); }
    }
    files.push(result);
  }
  compareCounts(files);
  const runs = await listRunSummaries(path.resolve(cwd, "data/state"));
  const failureFiles = (await findJson(raw)).filter((file) => path.basename(file) === "failure.json").map((file) => path.relative(cwd, file));
  if (files.length === 0) notes.push("Нормализованных JSON нет: это не подтверждает успешный сбор.");
  notes.push("Число строк суммируется по файлам, включая повторную нормализацию; это не число уникальных наблюдений.");
  notes.push("Падение >50% — сигнал проверки, не доказательство ошибки. Неоднозначные версии одного запуска исключены из сравнения.");
  notes.push("Проверяются стандартные data/normalized, data/raw и data/state. Пустой файл без store/category не сравнивается с историей.");
  const issues = files.flatMap((file) => file.issues);
  return {
    generatedAt: new Date().toISOString(), files, runs, failureFiles, notes,
    summary: {
      files: files.length, rowsAcrossFiles: files.reduce((sum, file) => sum + file.rows, 0),
      errors: issues.filter((issue) => issue.severity === "error").reduce((sum, issue) => sum + issue.count, 0),
      warnings: issues.filter((issue) => issue.severity === "warning").reduce((sum, issue) => sum + issue.count, 0),
      failedTasks: runs.reduce((sum, run) => sum + (run.counts.failed ?? 0), 0),
      unfinishedTasks: runs.reduce((sum, run) => sum + (run.counts.pending ?? 0) + (run.counts.running ?? 0), 0),
    },
  };
}

export async function saveQualityReport(cwd: string, report: QualityReport): Promise<string> {
  const directory = path.join(cwd, "data/reports", `quality-${report.generatedAt.replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  const lines = ["# Проверка качества локальных данных", "", `Время: ${report.generatedAt}`, "", "```json", JSON.stringify(report.summary, null, 2), "```", "", ...report.notes.map((note) => `- ${note}`), "", "## Файлы", ""];
  for (const file of report.files) lines.push(`- ${file.file}: ${file.rows} строк; ${file.issues.map((issue) => `${issue.code} × ${issue.count}`).join(", ") || "проверки пройдены"}`);
  lines.push("", "## Запуски", "", ...report.runs.map((run) => `- ${run.file}: ${run.status}; ${JSON.stringify(run.counts)}${run.error ? `; ${run.error}` : ""}`));
  lines.push("", "## Сохранённые ошибки сборщиков", "", ...report.failureFiles.map((file) => `- ${file}`));
  await writeFile(path.join(directory, "report.md"), `${lines.join("\n")}\n`, { encoding: "utf8", flag: "wx" });
  return directory;
}

async function findJson(directory: string): Promise<string[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink() || entry.name === "store-discovery") continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findJson(target));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(target);
  }
  return files.sort();
}

function within(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== "" && relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
