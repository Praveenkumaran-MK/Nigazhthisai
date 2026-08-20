import { useRef, useState } from "react";
import Papa from "papaparse";
import { Button, Card, Select, Alert, Badge, useToast } from "@sbt/ui";
import type { CsvEntityKind, CsvImportPreview } from "@sbt/shared-types";
import { supabase } from "../lib/supabase";
import { validateCsvRows } from "../lib/csvImport";

const BATCH_SIZE = 200;

export function CsvImportPage() {
  const { push } = useToast();
  const [kind, setKind] = useState<CsvEntityKind>("stops");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<CsvImportPreview<Record<string, unknown>> | null>(null);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setFileName(file.name);
    setImportResult(null);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        const outcome = validateCsvRows(kind, headers, results.data);
        if ("headerError" in outcome) {
          setHeaderError(outcome.headerError);
          setPreview(null);
        } else {
          setHeaderError(null);
          setPreview(outcome);
        }
      },
      error: (err) => {
        setHeaderError(`Could not parse CSV: ${err.message}`);
      },
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const resolveFareRows = async (rows: Record<string, unknown>[]) => {
    const { data: routes } = await supabase.from("routes").select("id, route_number");
    const { data: stops } = await supabase.from("stops_public").select("id, code");
    const routeByNumber = new Map((routes ?? []).map((r) => [r.route_number, r.id]));
    const stopByCode = new Map((stops ?? []).map((s) => [s.code, s.id]));

    const resolved: Record<string, unknown>[] = [];
    const unresolved: string[] = [];
    for (const row of rows) {
      const routeId = routeByNumber.get(row.route_number as string);
      const originId = stopByCode.get(row.origin_stop_code as string);
      const destId = stopByCode.get(row.dest_stop_code as string);
      if (!routeId || !originId || !destId) {
        unresolved.push(`route ${row.route_number}, ${row.origin_stop_code} → ${row.dest_stop_code}`);
        continue;
      }
      resolved.push({ route_id: routeId, origin_stop_id: originId, dest_stop_id: destId, flat_fare_amount: row.flat_fare_amount });
    }
    return { resolved, unresolved };
  };

  const handleConfirmImport = async () => {
    if (!preview || preview.validRows.length === 0) return;
    setIsImporting(true);
    // Declared outside the try block (not `let` inside it) so the catch
    // block below can report how many rows actually committed before the
    // batch that failed — previously a mid-import failure reported a bare
    // "Import failed" even though earlier batches had already committed,
    // leaving the admin unable to tell how much of the CSV actually landed.
    let inserted = 0;
    try {
      let rowsToInsert = preview.validRows;
      if (kind === "fares") {
        const { resolved, unresolved } = await resolveFareRows(preview.validRows);
        if (unresolved.length > 0) {
          push({
            tone: "warning",
            title: `${unresolved.length} row(s) skipped`,
            description: "Could not match route/stop codes — check they exist first.",
          });
        }
        rowsToInsert = resolved;
      }

      const table = kind === "stops" ? "stops" : kind === "routes" ? "routes" : "fare_matrix";
      for (let i = 0; i < rowsToInsert.length; i += BATCH_SIZE) {
        const batch = rowsToInsert.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from(table).insert(batch);
        if (error) throw new Error(error.message);
        inserted += batch.length;
      }
      setImportResult(`Imported ${inserted} row(s) into ${kind}.`);
      setPreview(null);
      setFileName(null);
      push({ tone: "success", title: "Import complete", description: `${inserted} row(s) added.` });
    } catch (e) {
      const message = e instanceof Error ? e.message : undefined;
      push({
        tone: "danger",
        title: "Import failed",
        description:
          inserted > 0
            ? `${inserted} row(s) were saved before the error: ${message ?? "unknown error"}`
            : message,
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">CSV Import</h1>
        <p className="text-sm text-slate-500 dark:text-slate-500">Bulk-load stops, routes, or fares.</p>
      </div>

      <Card>
        <Select
          label="Data type"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as CsvEntityKind);
            setPreview(null);
            setHeaderError(null);
            setFileName(null);
          }}
          options={[
            { value: "stops", label: "Stops (name, code, district, latitude, longitude)" },
            { value: "routes", label: "Routes (route_number, name)" },
            { value: "fares", label: "Fares (route_number, origin_stop_code, dest_stop_code, flat_fare_amount)" },
          ]}
        />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`mt-4 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center text-sm transition-colors ${
            isDragging ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10" : "border-border-light dark:border-border-dark"
          }`}
        >
          <p className="font-medium text-slate-700 dark:text-slate-300">{fileName ?? "Drag & drop a CSV, or click to browse"}</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>
      </Card>

      {headerError && <Alert tone="danger" title="Invalid CSV">{headerError}</Alert>}
      {importResult && <Alert tone="success" title="Done">{importResult}</Alert>}

      {preview && (
        <Card>
          <div className="mb-3 flex gap-2">
            <Badge tone="neutral">{preview.totalRows} total rows</Badge>
            <Badge tone="success">{preview.validRows.length} valid</Badge>
            <Badge tone="danger">{preview.invalidRows.length} invalid</Badge>
          </div>

          {preview.invalidRows.length > 0 && (
            <div className="mb-3 max-h-40 overflow-y-auto rounded-lg bg-red-50 p-3 text-xs text-red-800 dark:bg-danger-500/10 dark:text-danger-400">
              {preview.invalidRows.map((err, i) => (
                <p key={i}>
                  Row {err.row}, column "{err.column}": {err.message}
                </p>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setPreview(null)} disabled={isImporting}>
              Cancel
            </Button>
            <Button isLoading={isImporting} disabled={preview.validRows.length === 0} onClick={handleConfirmImport}>
              Import {preview.validRows.length} row(s)
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
