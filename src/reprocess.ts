import { parseArgs } from "node:util";
import { reprocessRaw } from "./reprocessing/reprocess.js";

async function main(): Promise<void> {
  const { values } = parseArgs({ args: process.argv.slice(2).filter((arg) => arg !== "--"),
    options: { raw: { type: "string" }, write: { type: "boolean" }, "time-zone": { type: "string" }, state: { type: "string" } }, strict: true, allowPositionals: false,
  });
  if (!values.raw) throw new Error("Укажите --raw с каталогом завершённого сбора");
  console.log(JSON.stringify(await reprocessRaw(process.cwd(), values.raw, values.write ?? false, values["time-zone"] ?? "Europe/Moscow", values.state), null, 2));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Ошибка повторной обработки"); process.exitCode = 1; });
