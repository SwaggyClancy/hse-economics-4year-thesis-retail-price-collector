import type { BrowserJsonResponse } from "../core/http.js";
import type { Coordinates } from "../core/types.js";

export interface PyaterochkaStoreResponse {
  readonly shop_address?: string;
  readonly store_city?: string | null;
  readonly sap_code?: string;
  readonly has_delivery?: boolean;
  readonly has_24h_delivery?: boolean;
  readonly [key: string]: unknown;
}

export interface DiscoveryPoint extends Coordinates {
  readonly id: string;
  readonly level: number;
}

export interface PyaterochkaDiscoveryClient {
  fetchStore(point: Coordinates): Promise<BrowserJsonResponse>;
  fetchStoresMap(bounds: PyaterochkaMapBounds): Promise<BrowserJsonResponse>;
  geocode(query: string): Promise<BrowserJsonResponse>;
}

export interface PyaterochkaMapBounds {
  readonly topLatitude: number;
  readonly bottomLatitude: number;
  readonly leftLongitude: number;
  readonly rightLongitude: number;
}
