import { parseArgs } from "node:util";
import path from "node:path";
import { readDailyConfig } from "./operations/daily-config.js";
import { runDaily } from "./operations/daily-runner.js";

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    options: { config: { type: "string" }, execute: { type: "boolean" }, "dry-run": { type: "boolean" } },
    strict: true, allowPositionals: false,
  });
  if (!values.config) throw new Error("Укажите --config с файлом daily config");
  if (values.execute && values["dry-run"]) throw new Error("Выберите execute или dry-run");
  const config = await readDailyConfig(values.config, process.cwd());
  const result = await runDaily(config, process.cwd(), values.execute ?? false,
    path.resolve(process.cwd(), process.env.STATE_DATA_DIR ?? "data/state", "daily"));
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "failed") process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Ошибка ежедневного запуска"); process.exitCode = 1;
});
