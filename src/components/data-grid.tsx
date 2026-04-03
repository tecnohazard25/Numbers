"use client";

import { useCallback, useMemo, useRef, type ReactNode } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type GridReadyEvent,
  type GridApi,
  themeQuartz,
} from "ag-grid-community";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import * as XLSX from "xlsx";
import { useTranslation } from "@/lib/i18n/context";
import { getAgGridLocale } from "@/lib/i18n/ag-grid";

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

interface DataGridProps<T> {
  rowData: T[];
  columnDefs: ColDef<T>[];
  domLayout?: "normal" | "autoHeight" | "print";
  height?: string;
  groupBy?: string[];
  pagination?: boolean;
  paginationPageSize?: number;
  exportFileName?: string;
  renderMobileCard?: (item: T, index: number) => ReactNode;
}

export function DataGrid<T>({
  rowData,
  columnDefs,
  domLayout = "autoHeight",
  height,
  pagination = false,
  paginationPageSize = 20,
  exportFileName = "export",
  renderMobileCard,
}: DataGridProps<T>) {
  const gridRef = useRef<AgGridReact<T>>(null);
  const gridApiRef = useRef<GridApi<T> | null>(null);
  const isMobile = useIsMobile();
  const { t, lang } = useTranslation();
  const agGridLocale = useMemo(() => getAgGridLocale(lang), [lang]);

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
    // Export works from rowData directly when on mobile (no grid API)
    const cols = columnDefs.filter(
      (c) => c.headerName && c.headerName !== "Azioni"
    );
    const headers = cols.map((c) => c.headerName ?? "");

    const rows: (string | number | boolean | null)[][] = [];

    const dataSource = gridApiRef.current ? [] : rowData;

    if (gridApiRef.current) {
      gridApiRef.current.forEachNodeAfterFilterAndSort((node) => {
        if (!node.data) return;
        const row = cols.map((col) => {
          const field = col.field as string | undefined;
          const valueGetter = col.valueGetter;
          const valueFormatter = col.valueFormatter;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let value: any;
          if (valueGetter && typeof valueGetter === "function") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            value = valueGetter({ data: node.data, node, colDef: col } as any);
          } else if (field) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            value = (node.data as any)[field];
          }

          if (valueFormatter && typeof valueFormatter === "function") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            value = valueFormatter({ value, data: node.data, node, colDef: col } as any);
          }

          return value ?? "";
        });
        rows.push(row);
      });
    } else {
      // Mobile: use rowData directly
      for (const item of dataSource) {
        const row = cols.map((col) => {
          const field = col.field as string | undefined;
          const valueGetter = col.valueGetter;
          const valueFormatter = col.valueFormatter;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let value: any;
          if (valueGetter && typeof valueGetter === "function") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            value = valueGetter({ data: item, colDef: col } as any);
          } else if (field) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            value = (item as any)[field];
          }

          if (valueFormatter && typeof valueFormatter === "function") {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            value = valueFormatter({ value, data: item, colDef: col } as any);
          }

          return value ?? "";
        });
        rows.push(row);
      }
    }

    const wsData = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = headers.map((h) => ({ wch: Math.max(h.length + 2, 15) }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dati");
    XLSX.writeFile(wb, `${exportFileName}.xlsx`);
  }, [exportFileName, columnDefs, rowData]);

  const containerStyle = useMemo(
    () => ({
      width: "100%",
      height: domLayout === "autoHeight" ? undefined : (height ?? "500px"),
    }),
    [domLayout, height]
  );

  // Mobile: card view
  if (isMobile && renderMobileCard) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" />
            {t("common.exportExcel")}
          </Button>
        </div>
        {rowData.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">
            {t("common.noData")}
          </p>
        ) : (
          <div className="space-y-3">
            {rowData.map((item, i) => renderMobileCard(item, i))}
          </div>
        )}
      </div>
    );
  }

  // Desktop: AG Grid
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
          localeText={agGridLocale}
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
