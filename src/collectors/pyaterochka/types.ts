export interface PyaterochkaProduct {
  readonly plu?: string | number;
  readonly name?: string;
  readonly [key: string]: unknown;
}

export interface PyaterochkaPageEnvelope {
  readonly parent_id?: string | null;
  readonly name?: string | null;
  readonly filters?: unknown;
  readonly products: readonly PyaterochkaProduct[];
  readonly request_id?: string | null;
  readonly [key: string]: unknown;
}

export interface CollectedPage {
  readonly pageNumber: number;
  readonly offset: number;
  readonly requestedAt: string;
  readonly receivedAt: string;
  readonly durationMs: number;
  readonly url: string;
  readonly envelope: PyaterochkaPageEnvelope;
}

export interface CollectionResult {
  readonly storeId: string;
  readonly categoryId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly pages: readonly CollectedPage[];
  readonly products: readonly PyaterochkaProduct[];
}
