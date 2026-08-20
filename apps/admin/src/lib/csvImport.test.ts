import { describe, expect, it } from "vitest";
import { validateCsvRows } from "./csvImport";

describe("validateCsvRows: stops", () => {
  it("flags a missing required header", () => {
    const result = validateCsvRows("stops", ["name", "code"], []);
    expect("headerError" in result).toBe(true);
  });

  it("separates valid and invalid rows", () => {
    const result = validateCsvRows(
      "stops",
      ["name", "code", "district", "latitude", "longitude"],
      [
        { name: "Central Stand", code: "TCB-01", district: "Thanjai Central", latitude: "10.787", longitude: "79.1378" },
        { name: "", code: "BAD-01", district: "Thanjai Central", latitude: "not-a-number", longitude: "79.1378" },
      ],
    );
    if ("headerError" in result) throw new Error("unexpected header error");
    expect(result.totalRows).toBe(2);
    expect(result.validRows).toHaveLength(1);
    expect(result.invalidRows.length).toBeGreaterThan(0);
    expect(result.validRows[0]).toMatchObject({ name: "Central Stand", code: "TCB-01" });
  });
});

describe("validateCsvRows: row numbering and whitespace/range checks", () => {
  it("reports row numbers matching the spreadsheet line (header is line 1)", () => {
    const result = validateCsvRows(
      "routes",
      ["route_number", "name"],
      [
        { route_number: "12A", name: "Valid" },
        { route_number: "", name: "Missing number" },
      ],
    );
    if ("headerError" in result) throw new Error("unexpected header error");
    // Second data row is spreadsheet row 3 (row 1 = header, row 2 = first data row).
    expect(result.invalidRows[0]?.row).toBe(3);
  });

  it("rejects a whitespace-only numeric cell instead of treating it as 0", () => {
    const result = validateCsvRows(
      "stops",
      ["name", "code", "district", "latitude", "longitude"],
      [{ name: "Stop", code: "S-01", district: "D", latitude: "   ", longitude: "79.1" }],
    );
    if ("headerError" in result) throw new Error("unexpected header error");
    expect(result.validRows).toHaveLength(0);
    expect(result.invalidRows.some((e) => e.column === "latitude")).toBe(true);
  });

  it("rejects an out-of-range latitude", () => {
    const result = validateCsvRows(
      "stops",
      ["name", "code", "district", "latitude", "longitude"],
      [{ name: "Stop", code: "S-01", district: "D", latitude: "999", longitude: "79.1" }],
    );
    if ("headerError" in result) throw new Error("unexpected header error");
    expect(result.validRows).toHaveLength(0);
  });
});

describe("validateCsvRows: fares", () => {
  it("requires a numeric fare amount", () => {
    const result = validateCsvRows(
      "fares",
      ["route_number", "origin_stop_code", "dest_stop_code", "flat_fare_amount"],
      [{ route_number: "12A", origin_stop_code: "TCB-01", dest_stop_code: "BTE-02", flat_fare_amount: "abc" }],
    );
    if ("headerError" in result) throw new Error("unexpected header error");
    expect(result.validRows).toHaveLength(0);
    expect(result.invalidRows[0]?.column).toBe("flat_fare_amount");
  });
});
