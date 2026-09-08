export interface Money {
  readonly amountMinor: number;
  readonly currency: "RUB";
  readonly minorUnitScale: 2;
}

export interface ProductSnapshot {
  readonly chain: "pyaterochka" | "magnit";
  readonly storeId: string;
  readonly categoryId: string;
  readonly categoryName: string | null;
  readonly productId: string;
  readonly name: string;
  readonly logicalDate: string;
  readonly runStartedAt: string;
  readonly collectedAt: string;
  readonly regularPrice: Money | null;
  readonly discountPrice: Money | null;
  readonly available: boolean;
  readonly unit: string | null;
  readonly propertyClarification: string | null;
  readonly stockLimit: string | null;
  readonly rating: number | null;
  readonly ratingCount: number | null;
  readonly rawReference: string;
}
