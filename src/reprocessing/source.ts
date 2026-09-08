import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export interface RawManifest {
  readonly chain: "magnit" | "pyaterochka";
  readonly storeId: string;
  readonly categoryId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly productCount: number;
  readonly pageFiles: readonly string[];
}

export interface RawPage {
  readonly filename: string;
  readonly metadata: { requestedAt: string; receivedAt: string; pageNumber: number; offset: number; productCount: number };
  readonly envelope: Record<string, unknown>;
  readonly products: readonly Record<string, unknown>[];
}

export interface RawSource {
  readonly directory: string;
  readonly manifest: RawManifest;
  readonly pages: readonly RawPage[];
  readonly sha256: string;
}

export async function loadRawSource(directory: string): Promise<RawSource> {
  const root = await realpath(directory);
  const digest = createHash("sha256");
  async function read(name: string): Promise<unknown> {
    const resolved = await realpath(path.join(root, name));
    if (path.dirname(resolved) !== root) throw new Error("Исходный файл выходит за пределы raw-каталога");
    const bytes = await readFile(resolved);
    digest.update(`${name}\0${bytes.length}\0`); digest.update(bytes);
    return JSON.parse(bytes.toString("utf8")) as unknown;
  }
  const value = await read("manifest.json");
  if (!record(value) || (value.chain !== "magnit" && value.chain !== "pyaterochka") ||
    !time(value.startedAt) || !time(value.finishedAt) || Date.parse(value.finishedAt) < Date.parse(value.startedAt) ||
    !integer(value.productCount) || !integer(value.pageCount) || !Array.isArray(value.pageFiles) ||
    value.pageFiles.length === 0 || value.pageCount !== value.pageFiles.length) throw new Error("Некорректный или незавершённый manifest.json");
  const storeId = value.chain === "magnit" ? value.storeCode : value.storeId;
  if (typeof storeId !== "string" || !/^[a-z0-9]+$/i.test(storeId) ||
    (typeof value.categoryId !== "string" && typeof value.categoryId !== "number") || !/^[a-z0-9]+$/i.test(String(value.categoryId))) {
    throw new Error("Manifest не содержит корректные коды магазина/категории");
  }
  const names = value.pageFiles as unknown[];
  if (value.chain === "magnit" && (!/^\d+$/.test(storeId) || !/^\d+$/.test(String(value.categoryId)) ||
    !Number.isSafeInteger(Number(value.categoryId)) || Number(value.categoryId) <= 0)) throw new Error("Некорректные коды Магнита");
  if (!names.every((name): name is string => typeof name === "string" && /^page-\d+-offset-\d+\.json$/.test(name)) || new Set(names).size !== names.length) {
    throw new Error("Некорректные или повторные имена страниц");
  }
  const manifest: RawManifest = { chain: value.chain, storeId, categoryId: String(value.categoryId), startedAt: value.startedAt, finishedAt: value.finishedAt, productCount: value.productCount, pageFiles: names };
  const pages: RawPage[] = [];
  for (const [index, name] of names.entries()) {
    const envelope = await read(name);
    const meta = await read(`${name}.meta.json`);
    if (!record(envelope) || !record(meta) || !integer(meta.offset) || meta.pageNumber !== index + 1 ||
      !integer(meta.productCount) || !time(meta.requestedAt) || !time(meta.receivedAt) ||
      Date.parse(meta.receivedAt) < Date.parse(meta.requestedAt)) throw new Error(`Некорректная страница/метаданные: ${name}`);
    const canonical = `page-${String(meta.pageNumber).padStart(4, "0")}-offset-${String(meta.offset).padStart(6, "0")}.json`;
    if (canonical !== name || (index === 0 ? meta.offset !== 0 : meta.offset <= pages[index - 1]!.metadata.offset)) {
      throw new Error("Порядок страниц и offset расходятся");
    }
    const products = manifest.chain === "magnit" ? envelope.items : envelope.products;
    if (!Array.isArray(products) || !products.every(record) || products.length !== meta.productCount) throw new Error(`Некорректный массив товаров: ${name}`);
    if (manifest.chain === "magnit") {
      const pagination = envelope.pagination;
      if (!record(pagination) || pagination.offset !== meta.offset || typeof pagination.hasMore !== "boolean" ||
        pagination.hasMore !== (index < names.length - 1) ||
        (index === names.length - 1 && pagination.totalCount !== manifest.productCount)) throw new Error("Пагинация Магнита не подтверждает завершённый сбор");
    }
    pages.push({ filename: name, envelope, products, metadata: { pageNumber: index + 1, offset: meta.offset, productCount: meta.productCount, requestedAt: meta.requestedAt, receivedAt: meta.receivedAt } });
  }
  if (pages.reduce((sum, page) => sum + page.products.length, 0) !== manifest.productCount) throw new Error("Сумма товаров расходится с manifest");
  return { directory: root, manifest, pages, sha256: digest.digest("hex") };
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function integer(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function time(value: unknown): value is string { return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)); }
