import { readFile } from "node:fs/promises";
import path from "node:path";

export type RetailChain = "pyaterochka" | "magnit";

/** Accepts discovery JSON, legacy configuration JSON, or one code per TXT line. */
export async function readCodeList(filePath: string, chain?: RetailChain): Promise<readonly string[]> {
  const contents = (await readFile(filePath, "utf8")).replace(/^\uFEFF/, "");
  return parseCodeList(contents, path.extname(filePath).toLowerCase() === ".txt", chain);
}

export function parseCodeList(
  contents: string,
  textFormat: boolean,
  chain?: RetailChain,
): readonly string[] {
  const entries: unknown = textFormat
    ? contents.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim() !== "")
    : JSON.parse(contents.replace(/^\uFEFF/, "")) as unknown;
  if (!Array.isArray(entries)) throw new Error("Список кодов должен быть JSON-массивом или TXT");
  const codes: string[] = [];
  for (const entry of entries as unknown[]) {
    let code: unknown = entry;
    if (typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
      const record = entry as Record<string, unknown>;
      if (chain !== undefined && record.chain !== undefined && record.chain !== chain) {
        throw new Error(`Список содержит магазин другой сети; ожидалась ${chain}`);
      }
      if (record.active !== undefined && typeof record.active !== "boolean") {
        throw new Error("Поле active должно быть boolean");
      }
      if (record.active === false) continue;
      code = record.code ?? record.externalCode;
      if (record.code !== undefined && record.externalCode !== undefined && record.code !== record.externalCode) {
        throw new Error("Поля code и externalCode расходятся");
      }
    }
    if (typeof code !== "string" || !/^[a-z0-9]+$/i.test(code.trim())) {
      throw new Error("Код должен быть непустой строкой из латинских букв и цифр");
    }
    codes.push(code.trim().toUpperCase());
  }
  const uniqueCodes = [...new Set(codes)];
  if (uniqueCodes.length === 0) throw new Error("В списке нет активных кодов");
  return uniqueCodes;
}
