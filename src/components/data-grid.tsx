"use client";

import { useCallback, useMemo, useRef } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type GridReadyEvent,
  type GridApi,
  themeQuartz,
} from "ag-grid-community";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";

ModuleRegistry.registerModules([AllCommunityModule]);

const darkTheme = themeQuartz.withParams({
  backgroundColor: "oklch(0.16 0.01 260)",
  foregroundColor: "oklch(0.93 0.005 260)",
  headerBackgroundColor: "oklch(0.20 0.012 260)",
  borderColor: "oklch(0.30 0.015 260)",
  rowHoverColor: "oklch(0.24 0.02 260)",
  selectedRowBackgroundColor: "oklch(0.28 0.02 260)",
  oddRowBackgroundColor: "oklch(0.18 0.01 260)",
  headerColumnResizeHandleColor: "oklch(0.55 0.15 250)",
  accentColor: "oklch(0.65 0.18 250)",
  chromeBackgroundColor: "oklch(0.14 0.015 260)",
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  fontSize: 13,
  headerFontSize: 13,
  borderRadius: 8,
});

const AG_GRID_LOCALE_IT: Record<string, string> = {
  page: "Pagina",
  more: "Altro",
  to: "a",
  of: "di",
  next: "Successivo",
  last: "Ultimo",
  first: "Primo",
  previous: "Precedente",
  loadingOoo: "Caricamento...",
  noRowsToShow: "Nessun dato da mostrare",
  filterOoo: "Filtra...",
  applyFilter: "Applica",
  resetFilter: "Reimposta",
  clearFilter: "Cancella",
  equals: "Uguale",
  notEqual: "Diverso",
  lessThan: "Minore di",
  greaterThan: "Maggiore di",
  contains: "Contiene",
  notContains: "Non contiene",
  startsWith: "Inizia con",
  endsWith: "Finisce con",
  blank: "Vuoto",
  notBlank: "Non vuoto",
  andCondition: "E",
  orCondition: "O",
  selectAll: "Seleziona tutto",
  searchOoo: "Cerca...",
  columns: "Colonne",
  filters: "Filtri",
  pivotMode: "Modalità Pivot",
  groups: "Gruppi",
  values: "Valori",
  rowGroupColumnsEmptyMessage: "Trascina qui per raggruppare",
  valueColumnsEmptyMessage: "Trascina qui per aggregare",
  pivotColumnsEmptyMessage: "Trascina qui per pivot",
  group: "Gruppo",
  export: "Esporta",
  csvExport: "Esporta CSV",
  excelExport: "Esporta Excel",
  pinColumn: "Blocca colonna",
  pinLeft: "Blocca a sinistra",
  pinRight: "Blocca a destra",
  noPin: "Sblocca",
  autosizeThisColumn: "Adatta colonna",
  autosizeAllColumns: "Adatta tutte",
  groupBy: "Raggruppa per",
  ungroupBy: "Rimuovi raggruppamento",
  resetColumns: "Reimposta colonne",
  expandAll: "Espandi tutto",
  collapseAll: "Comprimi tutto",
  sum: "Somma",
  min: "Min",
  max: "Max",
  count: "Conteggio",
  avg: "Media",
  copy: "Copia",
  copyWithHeaders: "Copia con intestazioni",
  paste: "Incolla",
  ctrlC: "Ctrl+C",
  ctrlX: "Ctrl+X",
  ctrlV: "Ctrl+V",
};

interface DataGridProps<T> {
  rowData: T[];
  columnDefs: ColDef<T>[];
  domLayout?: "normal" | "autoHeight" | "print";
  height?: string;
  groupBy?: string[];
  pagination?: boolean;
  paginationPageSize?: number;
  exportFileName?: string;
}

export function DataGrid<T>({
  rowData,
  columnDefs,
  domLayout = "autoHeight",
  height,
  pagination = false,
  paginationPageSize = 20,
  exportFileName = "export",
}: DataGridProps<T>) {
  const gridRef = useRef<AgGridReact<T>>(null);
  const gridApiRef = useRef<GridApi<T> | null>(null);

  const defaultColDef = useMemo<ColDef<T>>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      floatingFilter: true,
      flex: 1,
      minWidth: 100,
    }),
    []
  );

  const onGridReady = useCallback((params: GridReadyEvent<T>) => {
    gridApiRef.current = params.api;
    params.api.sizeColumnsToFit();
  }, []);

  const handleExport = useCallback(() => {
    const api = gridApiRef.current;
    if (!api) return;

    // Get visible columns (exclude "Azioni")
    const cols = columnDefs.filter(
      (c) => c.headerName && c.headerName !== "Azioni"
    );

    // Build header row
    const headers = cols.map((c) => c.headerName ?? "");

    // Build data rows
    const rows: (string | number | boolean | null)[][] = [];
    api.forEachNodeAfterFilterAndSort((node) => {
      if (!node.data) return;
      const row = cols.map((col) => {
        const field = col.field as string | undefined;
        const valueGetter = col.valueGetter;
        const valueFormatter = col.valueFormatter;

        let value: any;
        if (valueGetter && typeof valueGetter === "function") {
          value = valueGetter({ data: node.data, node, colDef: col } as any);
        } else if (field) {
          value = (node.data as any)[field];
        }

        if (valueFormatter && typeof valueFormatter === "function") {
          value = valueFormatter({ value, data: node.data, node, colDef: col } as any);
        }

        return value ?? "";
      });
      rows.push(row);
    });

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Auto-size columns
    ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 2, 15) }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dati");
    XLSX.writeFile(wb, `${exportFileName}.xlsx`);
  }, [exportFileName, columnDefs]);

  const containerStyle = useMemo(
    () => ({
      width: "100%",
      height: domLayout === "autoHeight" ? undefined : (height ?? "500px"),
    }),
    [domLayout, height]
  );

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-1" />
          Esporta Excel
        </Button>
      </div>
      <div style={containerStyle}>
        <AgGridReact<T>
          ref={gridRef}
          theme={darkTheme}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          domLayout={domLayout}
          localeText={AG_GRID_LOCALE_IT}
          onGridReady={onGridReady}
          animateRows={true}
          pagination={pagination}
          paginationPageSize={paginationPageSize}
          suppressCellFocus={true}
        />
      </div>
    </div>
  );
}
