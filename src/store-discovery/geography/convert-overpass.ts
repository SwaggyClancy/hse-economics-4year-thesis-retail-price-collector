import { readFile, writeFile } from "node:fs/promises";
import { convertOverpassRelations } from "./overpass.js";

async function main(): Promise<void> {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    throw new Error("Использование: convert-overpass <input.json> <output.geojson>");
  }
  const source = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  const collection = convertOverpassRelations(source);
  await writeFile(outputPath, `${JSON.stringify(collection)}\n`, "utf8");
  console.log(`Сохранено полигонов: ${collection.features.length}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
