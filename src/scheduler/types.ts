export type TaskStatus = "pending" | "running" | "success" | "failed";
export type RunStatus = "running" | "paused" | "completed" | "completed_with_errors";

export interface CollectionTaskState {
  readonly id: string;
  readonly storeId: string;
  readonly categoryId: string;
  readonly status: TaskStatus;
  readonly attempts: number;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
  readonly productCount: number | null;
  readonly rawRunDirectory: string | null;
  readonly normalizedPath: string | null;
  readonly errorName: string | null;
  readonly errorMessage: string | null;
}

export interface CollectionRunState {
  readonly version: 1;
  readonly chain: "pyaterochka";
  readonly runId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: RunStatus;
  readonly tasks: readonly CollectionTaskState[];
}

export interface CollectionTaskInput {
  readonly storeId: string;
  readonly categoryId: string;
}
