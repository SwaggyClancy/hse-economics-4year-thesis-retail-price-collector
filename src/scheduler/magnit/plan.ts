import { readCodeList } from "../../config/code-list.js";
import type { MagnitConfig } from "../../config/magnit-config.js";
import type { CollectionTaskInput } from "../types.js";

export async function createMagnitPlan(config: MagnitConfig): Promise<readonly CollectionTaskInput[]> {
  if (!config.batch) return [{ storeId: config.storeCode, categoryId: String(config.categoryId) }];
  if (config.storesFile === null || config.categoriesFile === null) throw new Error("Не заданы файлы плана");
  const [stores, categories] = await Promise.all([
    readCodeList(config.storesFile, "magnit"), readCodeList(config.categoriesFile),
  ]);
  if (stores.some((code) => !/^\d+$/.test(code))) throw new Error("Коды магазинов Магнита должны быть числовыми строками");
  const normalizedCategories = [...new Set(categories.map((code) => {
    if (!/^\d+$/.test(code) || !Number.isSafeInteger(Number(code)) || Number(code) <= 0) {
      throw new Error("Некорректный код категории Магнита");
    }
    return String(Number(code));
  }))];
  return stores.flatMap((storeId) => normalizedCategories.map((categoryId) => ({ storeId, categoryId })));
}
