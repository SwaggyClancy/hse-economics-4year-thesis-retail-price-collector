export type Chain = "pyaterochka" | "magnit";

export interface Coordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface DiscoveredStore extends Coordinates {
  readonly chain: Chain;
  readonly externalCode: string;
  readonly address: string;
  readonly active: boolean;
  readonly administrativeDistrict: string | null;
  readonly municipalDistrict: string | null;
  readonly discoveredAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface DiscoveryManifest {
  readonly version: 1;
  readonly chain: Chain;
  readonly city: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly rawRequestCount: number;
  readonly uniqueStoreCount: number;
  readonly stores: readonly DiscoveredStore[];
}
