import type { BrowserJsonResponse } from "../core/http.js";

export interface MagnitStoreDetail {
  readonly address?: string;
  readonly cityFiasId?: string;
  readonly coordinates?: {
    readonly latitude?: number;
    readonly longitude?: number;
  };
  readonly deliveryTypeList?: readonly string[];
  readonly externalId?: {
    readonly owner?: string;
    readonly storeCode?: string;
  };
  readonly isActive?: boolean;
  readonly status?: string;
  readonly storeType?: string;
  readonly storeTypeV2?: string;
  readonly timetableList?: readonly unknown[];
  readonly [key: string]: unknown;
}

export interface MagnitDetailEnvelope {
  readonly data: readonly MagnitStoreDetail[];
  readonly totalCount: number;
  readonly [key: string]: unknown;
}

export interface MagnitDetailRequest {
  readonly query: string;
  readonly storeTypes: readonly string[];
  readonly deliveryTypes?: readonly string[];
  readonly offset: number;
  readonly size: number;
}

export interface MagnitBasicStore {
  readonly coordinates?: { readonly latitude?: number; readonly longitude?: number };
  readonly externalId?: { readonly owner?: string; readonly storeCode?: string };
  readonly isActive?: boolean;
  readonly status?: string;
  readonly storeType?: string;
  readonly storeTypeV2?: string;
  readonly [key: string]: unknown;
}

export interface MagnitBasicEnvelope {
  readonly items: {
    readonly items: readonly MagnitBasicStore[];
    readonly typeName?: string;
  };
  readonly [key: string]: unknown;
}

export interface MagnitDiscoveryClient {
  fetchBasic(request: Pick<MagnitDetailRequest, "query" | "storeTypes" | "deliveryTypes">): Promise<BrowserJsonResponse>;
  fetchDetail(request: MagnitDetailRequest): Promise<BrowserJsonResponse>;
}
