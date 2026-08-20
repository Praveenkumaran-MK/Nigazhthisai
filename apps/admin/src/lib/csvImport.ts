import type { CsvEntityKind, CsvImportPreview, CsvRowValidationError } from "@sbt/shared-types";

export interface CsvSchema {
  requiredHeaders: string[];
  validateRow: (row: Record<string, string>, index: number) => { value?: Record<string, unknown>; errors: CsvRowValidationError[] };
}

const isNonEmpty = (v: string | undefined) => Boolean(v && v.trim().length > 0);
// `Number("")` is 0 and `Number(" ")` is also 0 — both are falsy-looking
// but pass the old `!Number.isNaN(Number(v))` check, so a whitespace-only
// cell silently became a valid 0. Require a non-empty trimmed string first.
const isNumeric = (v: string | undefined) => {
  const trimmed = v?.trim();
  return Boolean(trimmed && trimmed.length > 0 && !Number.isNaN(Number(trimmed)));
};
const isValidLatitude = (v: string | undefined) => isNumeric(v) && Math.abs(Number(v)) <= 90;
const isValidLongitude = (v: string | undefined) => isNumeric(v) && Math.abs(Number(v)) <= 180;

export const csvSchemas: Record<CsvEntityKind, CsvSchema> = {
  stops: {
    requiredHeaders: ["name", "code", "district", "latitude", "longitude"],
    validateRow: (row, index) => {
      const errors: CsvRowValidationError[] = [];
      if (!isNonEmpty(row.name)) errors.push({ row: index, column: "name", message: "Name is required" });
      if (!isNonEmpty(row.code)) errors.push({ row: index, column: "code", message: "Code is required" });
      if (!isNonEmpty(row.district)) errors.push({ row: index, column: "district", message: "District is required" });
      if (!isValidLatitude(row.latitude)) errors.push({ row: index, column: "latitude", message: "Latitude must be a number between -90 and 90" });
      if (!isValidLongitude(row.longitude)) errors.push({ row: index, column: "longitude", message: "Longitude must be a number between -180 and 180" });
      if (errors.length > 0) return { errors };
      // Past this point every field checked above by isNonEmpty/isNumeric is
      // known non-empty; `noUncheckedIndexedAccess` still types plain
      // Record<string,string> property reads as possibly-undefined, so
      // assert what validation already guarantees rather than re-checking.
      return {
        errors: [],
        value: {
          name: row.name!.trim(),
          code: row.code!.trim(),
          district: row.district!.trim(),
          location: `SRID=4326;POINT(${row.longitude} ${row.latitude})`,
        },
      };
    },
  },
  routes: {
    requiredHeaders: ["route_number", "name"],
    validateRow: (row, index) => {
      const errors: CsvRowValidationError[] = [];
      if (!isNonEmpty(row.route_number)) errors.push({ row: index, column: "route_number", message: "Route number is required" });
      if (!isNonEmpty(row.name)) errors.push({ row: index, column: "name", message: "Name is required" });
      if (errors.length > 0) return { errors };
      return { errors: [], value: { route_number: row.route_number!.trim(), name: row.name!.trim() } };
    },
  },
  fares: {
    requiredHeaders: ["route_number", "origin_stop_code", "dest_stop_code", "flat_fare_amount"],
    validateRow: (row, index) => {
      const errors: CsvRowValidationError[] = [];
      if (!isNonEmpty(row.route_number)) errors.push({ row: index, column: "route_number", message: "Route number is required" });
      if (!isNonEmpty(row.origin_stop_code)) errors.push({ row: index, column: "origin_stop_code", message: "Origin stop code is required" });
      if (!isNonEmpty(row.dest_stop_code)) errors.push({ row: index, column: "dest_stop_code", message: "Destination stop code is required" });
      if (!isNumeric(row.flat_fare_amount)) errors.push({ row: index, column: "flat_fare_amount", message: "Fare must be a number" });
      if (errors.length > 0) return { errors };
      return {
        errors: [],
        value: {
          route_number: row.route_number!.trim(),
          origin_stop_code: row.origin_stop_code!.trim(),
          dest_stop_code: row.dest_stop_code!.trim(),
          flat_fare_amount: Number(row.flat_fare_amount),
        },
      };
    },
  },
};

export function validateCsvRows(
  kind: CsvEntityKind,
  headers: string[],
  rows: Array<Record<string, string>>,
): CsvImportPreview<Record<string, unknown>> | { headerError: string } {
  const schema = csvSchemas[kind];
  const missing = schema.requiredHeaders.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return { headerError: `Missing required column(s): ${missing.join(", ")}` };
  }

  const validRows: Record<string, unknown>[] = [];
  const invalidRows: CsvRowValidationError[] = [];

  rows.forEach((row, index) => {
    // +2, not +1: index is 0-based over DATA rows, but row 1 of the actual
    // spreadsheet is the header — so the first data row is spreadsheet row
    // 2. The previous +1 reported every error one line above where the
    // admin needed to look to fix it.
    const result = schema.validateRow(row, index + 2);
    if (result.errors.length > 0) invalidRows.push(...result.errors);
    else if (result.value) validRows.push(result.value);
  });

  return { totalRows: rows.length, validRows, invalidRows };
}
