import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { filenameTimestamp } from "../../core/time.js";
import type { Chain, DiscoveryManifest } from "./types.js";

export class DiscoveryStorage {
  private constructor(public readonly runDirectory: string) {}

  public static async create(
    rawDataDirectory: string,
    chain: Chain,
    city: string,
    startedAt: Date,
  ): Promise<DiscoveryStorage> {
    const safeCity = city.toLowerCase().replaceAll(/[^a-zа-яё0-9]+/giu, "-").replace(/^-|-$/gu, "");
    const runDirectory = path.join(
      rawDataDirectory,
      startedAt.toISOString().slice(0, 10),
      chain,
      "store-discovery",
      `${safeCity}_${filenameTimestamp(startedAt)}`,
    );
    await mkdir(path.join(runDirectory, "responses"), { recursive: true });
    return new DiscoveryStorage(runDirectory);
  }

  public static open(runDirectory: string): DiscoveryStorage {
    return new DiscoveryStorage(path.resolve(runDirectory));
  }

  public async writeRawResponse(sequence: number, label: string, value: unknown): Promise<string> {
    const filename = `${String(sequence).padStart(6, "0")}-${sanitizeLabel(label)}.json`;
    const filePath = path.join(this.runDirectory, "responses", filename);
    await writeJsonAtomic(filePath, value);
    return filePath;
  }

  public async writeCheckpoint(value: unknown): Promise<string> {
    const filePath = path.join(this.runDirectory, "checkpoint.json");
    await writeJsonAtomic(filePath, value);
    return filePath;
  }

  public async readCheckpoint(): Promise<unknown> {
    try {
      return JSON.parse(await readFile(path.join(this.runDirectory, "checkpoint.json"), "utf8")) as unknown;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return null;
      throw error;
    }
  }

  public async writeManifest(manifest: DiscoveryManifest): Promise<string> {
    const filePath = path.join(this.runDirectory, "manifest.json");
    await writeJsonAtomic(filePath, manifest);
    return filePath;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function sanitizeLabel(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-zа-яё0-9-]+/giu, "-").replace(/^-|-$/gu, "") || "response";
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}
