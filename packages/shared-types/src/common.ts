export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Discriminated union used by every hook that wraps an async Supabase call. */
export type AsyncState<T, E = AppError> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: E };

export interface AppError {
  code: string;
  message: string;
  cause?: unknown;
}

export type CsvEntityKind = "stops" | "routes" | "fares";

export interface CsvRowValidationError {
  row: number;
  column: string;
  message: string;
}

export interface CsvImportPreview<T> {
  totalRows: number;
  validRows: T[];
  invalidRows: CsvRowValidationError[];
}
