export interface MagnitProduct {
  readonly id?: string | number;
  readonly productId?: string | number;
  readonly name?: string;
  readonly [key: string]: unknown;
}

export interface MagnitPagination {
  readonly hasMore: boolean;
  readonly limit: number;
  readonly offset: number;
  readonly totalCount: number;
  readonly nextOffset?: number | null;
}

export interface MagnitPageEnvelope {
  readonly items: readonly MagnitProduct[];
  readonly pagination: MagnitPagination;
  readonly [key: string]: unknown;
}

export interface MagnitCollectedPage {
  readonly pageNumber: number;
  readonly offset: number;
  readonly requestedAt: string;
  readonly receivedAt: string;
  readonly durationMs: number;
  readonly url: string;
  readonly envelope: MagnitPageEnvelope;
}

export interface MagnitCollectionResult {
  readonly storeCode: string;
  readonly categoryId: number;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly pages: readonly MagnitCollectedPage[];
  readonly products: readonly MagnitProduct[];
}
