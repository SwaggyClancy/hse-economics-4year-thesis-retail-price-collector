import { buildQualityReport, saveQualityReport } from "./quality/report.js";

async function main(): Promise<void> {
  if (process.argv.slice(2).some((arg) => arg !== "--")) throw new Error("Команда quality не принимает аргументы; запустите из корня проекта");
  const report = await buildQualityReport(process.cwd());
  const directory = await saveQualityReport(process.cwd(), report);
  console.log(JSON.stringify({ ...report.summary, reportDirectory: directory }, null, 2));
  if (report.summary.errors > 0 || report.summary.failedTasks > 0 || report.runs.some((run) => run.status === "invalid")) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Ошибка отчёта"); process.exitCode = 1;
});
