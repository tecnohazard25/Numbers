"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  type ColDef,
  type GridReadyEvent,
  type GridApi,
  type ICellRendererParams,
  themeQuartz,
} from "ag-grid-community";
import { useTheme } from "next-themes";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import {
  Download,
  Pencil,
  Plus,
  Trash2,
  Group,
  X,
  Settings2,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import * as XLSX from "xlsx";
import { useTranslation } from "@/lib/i18n/context";
import { getAgGridLocale } from "@/lib/i18n/ag-grid";

ModuleRegistry.registerModules([AllCommunityModule]);

// --- Themes ---
const baseThemeParams = {
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  fontSize: 13,
  headerFontSize: 13,
  borderRadius: 8,
};

const darkTheme = themeQuartz.withParams({
  ...baseThemeParams,
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
});

const lightTheme = themeQuartz.withParams({
  ...baseThemeParams,
  backgroundColor: "oklch(1 0 0)",
  foregroundColor: "oklch(0.15 0.01 260)",
  headerBackgroundColor: "oklch(0.97 0.005 260)",
  borderColor: "oklch(0.88 0.01 260)",
  rowHoverColor: "oklch(0.96 0.005 260)",
  selectedRowBackgroundColor: "oklch(0.93 0.01 250)",
  oddRowBackgroundColor: "oklch(0.98 0.003 260)",
  headerColumnResizeHandleColor: "oklch(0.55 0.15 250)",
  accentColor: "oklch(0.55 0.2 250)",
  chromeBackgroundColor: "oklch(0.97 0.005 260)",
});

// --- Layout persistence ---
interface GridLayout {
  name: string;
  hiddenColumns: string[];
  columnWidths: Record<string, number>;
  sortModel: { colId: string; sort: "asc" | "desc" }[];
  groupByColumn: string | null;
}

function loadLayouts(gridId: string): GridLayout[] {
  try {
    const raw = localStorage.getItem(`grid-layouts-${gridId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLayouts(gridId: string, layouts: GridLayout[]) {
  localStorage.setItem(`grid-layouts-${gridId}`, JSON.stringify(layouts));
}

// --- Component ---
interface DataGridProps<T> {
  rowData: T[];
  columnDefs: ColDef<T>[];
  domLayout?: "normal" | "autoHeight" | "print";
  height?: string;
  gridId?: string;
  pagination?: boolean;
  paginationPageSize?: number;
  exportFileName?: string;
  renderMobileCard?: (item: T, index: number) => ReactNode;
  onCreate?: () => void;
  onEdit?: (data: T) => void;
  onDelete?: (data: T[]) => void;
}

export function DataGrid<T>({
  rowData,
  columnDefs,
  domLayout = "normal",
  height,
  gridId,
  pagination = true,
  paginationPageSize = 25,
  exportFileName = "export",
  renderMobileCard,
  onCreate,
  onEdit,
  onDelete,
}: DataGridProps<T>) {
  const gridRef = useRef<AgGridReact<T>>(null);
  const gridApiRef = useRef<GridApi<T> | null>(null);
  const isMobile = useIsMobile();
  const { t, lang } = useTranslation();
  const { resolvedTheme } = useTheme();
  const agGridLocale = useMemo(() => getAgGridLocale(lang), [lang]);
  const effectiveGridId = gridId ?? exportFileName;

  // --- Fix 1: Theme-aware grid ---
  const gridTheme = resolvedTheme === "light" ? lightTheme : darkTheme;

  const defaultColDef = useMemo<ColDef<T>>(
    () => ({
      sortable: true,
      filter: true,
      resizable: true,
      floatingFilter: true,
      minWidth: 100,
    }),
    []
  );

  const autoSizeStrategy = useMemo(() => ({
    type: "fitCellContents" as const,
  }), []);

  // --- Column visibility ---
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());

  const toggleableColumns = useMemo(
    () => columnDefs.filter((c) => c.headerName && c.headerName !== t("common.actions")),
    [columnDefs, t]
  );

  const toggleColumn = useCallback((headerName: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(headerName)) {
        next.delete(headerName);
      } else {
        next.add(headerName);
      }
      return next;
    });
  }, []);

  // --- Grouping ---
  const [groupByColumn, setGroupByColumn] = useState<string | null>(null);

  const groupableColumns = useMemo(
    () => columnDefs.filter((c) => c.headerName && c.headerName !== t("common.actions")),
    [columnDefs, t]
  );

  const getGroupValue = useCallback((item: T, col: ColDef<T>): string => {
    const field = col.field as string | undefined;
    const vg = col.valueGetter;
    const vf = col.valueFormatter;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let value: any;
    if (vg && typeof vg === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      value = vg({ data: item, colDef: col } as any);
    } else if (field) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      value = (item as any)[field];
    }
    if (vf && typeof vf === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      value = vf({ value, data: item, colDef: col } as any);
    }
    return String(value ?? "");
  }, []);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const prevGroupCol = useRef(groupByColumn);
  if (prevGroupCol.current !== groupByColumn) {
    prevGroupCol.current = groupByColumn;
    if (collapsedGroups.size > 0) setCollapsedGroups(new Set());
  }

  const groupedRowData = useMemo(() => {
    if (!groupByColumn) return rowData;
    const col = columnDefs.find((c) => c.headerName === groupByColumn);
    if (!col) return rowData;
    const groups = new Map<string, T[]>();
    for (const item of rowData) {
      const key = getGroupValue(item, col);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    }
    const result: (T | { __isGroupRow: true; __groupKey: string; __groupCount: number })[] = [];
    for (const [key, items] of groups) {
      result.push({ __isGroupRow: true, __groupKey: key, __groupCount: items.length } as never);
      if (!collapsedGroups.has(key)) {
        result.push(...items);
      }
    }
    return result as T[];
  }, [rowData, groupByColumn, columnDefs, getGroupValue, collapsedGroups]);

  // --- Fix 3: Row count ---
  const totalRows = rowData.length;
  const visibleRows = useMemo(() => {
    if (!groupByColumn) return totalRows;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return groupedRowData.filter((r) => !(r as any).__isGroupRow).length;
  }, [groupedRowData, groupByColumn, totalRows]);

  const toggleGroupCollapse = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  const isFullWidthRow = useCallback((params: { rowNode: { data: unknown } }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return !!(params.rowNode.data as any)?.__isGroupRow;
  }, []);

  const fullWidthCellRenderer = useCallback((params: ICellRendererParams<T>) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = params.data as any;
    if (!data?.__isGroupRow) return null;
    const collapsed = collapsedGroups.has(data.__groupKey);
    return (
      <div
        className="flex items-center gap-2 px-3 h-full bg-muted/50 cursor-pointer font-medium text-sm select-none"
        onClick={() => toggleGroupCollapse(data.__groupKey)}
      >
        <span className="text-muted-foreground">{collapsed ? "▶" : "▼"}</span>
        <span>{data.__groupKey || t("common.none")}</span>
        <span className="text-muted-foreground text-xs">({data.__groupCount})</span>
      </div>
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsedGroups, toggleGroupCollapse, t]);

  // --- Layouts ---
  const [layouts, setLayouts] = useState<GridLayout[]>([]);
  const [layoutNameInput, setLayoutNameInput] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  useEffect(() => {
    setLayouts(loadLayouts(effectiveGridId));
  }, [effectiveGridId]);

  const getCurrentState = useCallback((): Omit<GridLayout, "name"> => {
    const columnWidths: Record<string, number> = {};
    if (gridApiRef.current) {
      const allCols = gridApiRef.current.getColumns();
      allCols?.forEach((col) => {
        const name = col.getColDef().headerName;
        if (name) columnWidths[name] = col.getActualWidth();
      });
    }
    const sortModel: { colId: string; sort: "asc" | "desc" }[] = [];
    if (gridApiRef.current) {
      gridApiRef.current.getColumnState().forEach((cs) => {
        if (cs.sort) sortModel.push({ colId: cs.colId, sort: cs.sort as "asc" | "desc" });
      });
    }
    return { hiddenColumns: Array.from(hiddenColumns), columnWidths, sortModel, groupByColumn };
  }, [hiddenColumns, groupByColumn]);

  const handleSaveLayout = useCallback(() => {
    if (!layoutNameInput.trim()) return;
    const state = getCurrentState();
    const layout: GridLayout = { name: layoutNameInput.trim(), ...state };
    const existing = layouts.filter((l) => l.name !== layout.name);
    const updated = [...existing, layout];
    setLayouts(updated);
    saveLayouts(effectiveGridId, updated);
    setLayoutNameInput("");
    setShowSaveInput(false);
  }, [layoutNameInput, getCurrentState, layouts, effectiveGridId]);

  const handleLoadLayout = useCallback((layout: GridLayout) => {
    setHiddenColumns(new Set(layout.hiddenColumns));
    setGroupByColumn(layout.groupByColumn);
    if (gridApiRef.current) {
      const colState = gridApiRef.current.getColumnState().map((cs) => {
        const sortEntry = layout.sortModel.find((s) => s.colId === cs.colId);
        return { ...cs, sort: sortEntry?.sort ?? null, sortIndex: sortEntry ? 0 : null };
      });
      gridApiRef.current.applyColumnState({ state: colState });
      const allCols = gridApiRef.current.getColumns();
      allCols?.forEach((col) => {
        const name = col.getColDef().headerName;
        if (name && layout.columnWidths[name]) {
          gridApiRef.current!.setColumnWidths([{ key: col.getColId(), newWidth: layout.columnWidths[name] }]);
        }
      });
    }
    setOptionsMenuOpen(false);
  }, []);

  const handleDeleteLayout = useCallback((name: string) => {
    const updated = layouts.filter((l) => l.name !== name);
    setLayouts(updated);
    saveLayouts(effectiveGridId, updated);
  }, [layouts, effectiveGridId]);

  const handleResetLayout = useCallback(() => {
    setHiddenColumns(new Set());
    setGroupByColumn(null);
    if (gridApiRef.current) {
      gridApiRef.current.resetColumnState();
      gridApiRef.current.autoSizeAllColumns();
    }
    setOptionsMenuOpen(false);
  }, []);

  // --- Visible columns ---
  const visibleColumnDefs = useMemo(
    () => columnDefs.map((c) => ({
      ...c,
      hide: c.headerName ? hiddenColumns.has(c.headerName) : false,
    })),
    [columnDefs, hiddenColumns]
  );

  // --- Edit column ---
  const editColDef = useMemo<ColDef<T> | null>(() => {
    if (!onEdit) return null;
    return {
      headerName: "",
      width: 50, maxWidth: 50, minWidth: 50,
      sortable: false, filter: false, resizable: false,
      floatingFilter: false, suppressHeaderMenuButton: true,
      cellRenderer: (params: ICellRendererParams<T>) => {
        if (!params.data) return null;
        return (
          <div className="flex items-center justify-center h-full">
            <Tooltip>
              <TooltipTrigger render={
                <button
                  type="button"
                  className="p-1 rounded hover:bg-muted transition-colors"
                  onClick={() => onEdit(params.data!)}
                >
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              } />
              <TooltipContent>{t("common.edit")}</TooltipContent>
            </Tooltip>
          </div>
        );
      },
    };
  }, [onEdit, t]);

  // --- Selection for delete ---
  const [selectedRows, setSelectedRows] = useState<T[]>([]);

  const onSelectionChanged = useCallback(() => {
    if (!gridApiRef.current || !onDelete) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const selected = gridApiRef.current.getSelectedRows().filter((r) => !(r as any).__isGroupRow);
    setSelectedRows(selected);
  }, [onDelete]);

  // --- Final column defs ---
  const finalColumnDefs = useMemo(() => {
    const cols = visibleColumnDefs;
    return editColDef ? [editColDef, ...cols] : cols;
  }, [editColDef, visibleColumnDefs]);

  const onGridReady = useCallback((params: GridReadyEvent<T>) => {
    gridApiRef.current = params.api;
  }, []);

  // --- Fix 2: Export only visible columns ---
  const handleExport = useCallback(() => {
    const cols = columnDefs.filter(
      (c) => c.headerName && c.headerName !== t("common.actions") && !hiddenColumns.has(c.headerName!)
    );
    const headers = cols.map((c) => c.headerName ?? "");
    const rows: (string | number | boolean | null)[][] = [];
    const dataSource = gridApiRef.current ? [] : rowData;

    if (gridApiRef.current) {
      gridApiRef.current.forEachNodeAfterFilterAndSort((node) => {
        if (!node.data) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((node.data as any).__isGroupRow) return;
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
  }, [exportFileName, columnDefs, rowData, t, hiddenColumns]);

  const containerStyle = useMemo(
    () => ({
      width: "100%",
      ...(domLayout === "autoHeight"
        ? {}
        : height
          ? { height }
          : { flex: "1 1 0%", minHeight: "400px" }),
    }),
    [domLayout, height]
  );

  // --- Fix 4: Disable pagination when grouping ---
  const effectivePagination = pagination && !groupByColumn;

  // --- Fix 5: Options menu (combines Columns, Group, Layout) ---
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);
  const [optionsTab, setOptionsTab] = useState<"columns" | "group" | "layout">("columns");
  const optionsMenuRef = useRef<HTMLDivElement>(null);

  // --- Backdrop ---
  const Backdrop = ({ onClose }: { onClose: () => void }) => (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div className="fixed inset-0 z-40" onClick={onClose} />
  );

  // --- Mobile ---
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

  // --- Desktop ---
  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {/* Left: New + Delete */}
        <div className="flex items-center gap-2">
          {onCreate && (
            <Button size="sm" onClick={onCreate}>
              <Plus className="h-4 w-4 mr-1" />
              {t("common.new")}
            </Button>
          )}
          {onDelete && (
            <Button
              variant="destructive"
              size="sm"
              disabled={selectedRows.length === 0}
              onClick={() => onDelete(selectedRows)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {t("common.delete")} {selectedRows.length > 0 && `(${selectedRows.length})`}
            </Button>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Fix 3: Row count */}
        <span className="text-xs text-muted-foreground">
          {visibleRows === totalRows
            ? `${totalRows} ${t("common.rows")}`
            : `${visibleRows} / ${totalRows} ${t("common.rows")}`}
        </span>

        {/* Group badge */}
        {groupByColumn && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-primary/10 text-primary text-sm">
            <Group className="h-3.5 w-3.5" />
            {groupByColumn}
            <button
              type="button"
              className="ml-1 hover:text-destructive transition-colors"
              onClick={() => setGroupByColumn(null)}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Fix 5: Options menu (Columns + Group + Layout + Autosize) */}
        <div className="relative" ref={optionsMenuRef}>
          <Button variant="outline" size="sm" onClick={() => setOptionsMenuOpen((v) => !v)}>
            <Settings2 className="h-4 w-4 mr-1" />
            {t("common.options")}
          </Button>
          {optionsMenuOpen && (
            <>
              <Backdrop onClose={() => { setOptionsMenuOpen(false); setShowSaveInput(false); }} />
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[260px] rounded-md border bg-popover shadow-md">
                {/* Tabs */}
                <div className="flex border-b">
                  {(["columns", "group", "layout"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                        optionsTab === tab
                          ? "text-primary border-b-2 border-primary"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      onClick={() => setOptionsTab(tab)}
                    >
                      {tab === "columns" ? t("common.columns") : tab === "group" ? t("common.groupBy") : "Layout"}
                    </button>
                  ))}
                </div>

                <div className="p-2 max-h-[300px] overflow-y-auto">
                  {/* Columns tab */}
                  {optionsTab === "columns" && (
                    <>
                      {toggleableColumns.map((col) => {
                        const name = col.headerName!;
                        return (
                          <label key={name} className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted cursor-pointer">
                            <input type="checkbox" checked={!hiddenColumns.has(name)} onChange={() => toggleColumn(name)} className="rounded" />
                            {name}
                          </label>
                        );
                      })}
                      <div className="border-t my-1.5" />
                      <button
                        type="button"
                        className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted cursor-pointer w-full text-left"
                        onClick={() => { gridApiRef.current?.autoSizeAllColumns(); setOptionsMenuOpen(false); }}
                      >
                        {t("common.autosizeColumns")}
                      </button>
                    </>
                  )}

                  {/* Group tab */}
                  {optionsTab === "group" && (
                    <>
                      <button
                        type="button"
                        className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted cursor-pointer w-full text-left ${!groupByColumn ? "text-primary font-medium" : ""}`}
                        onClick={() => { setGroupByColumn(null); setOptionsMenuOpen(false); }}
                      >
                        {t("common.none")}
                      </button>
                      <div className="border-t my-1" />
                      {groupableColumns.map((col) => {
                        const name = col.headerName!;
                        const active = groupByColumn === name;
                        return (
                          <button
                            key={name}
                            type="button"
                            className={`flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted cursor-pointer w-full text-left ${active ? "text-primary font-medium" : ""}`}
                            onClick={() => { setGroupByColumn(name); setOptionsMenuOpen(false); }}
                          >
                            {name}
                          </button>
                        );
                      })}
                    </>
                  )}

                  {/* Layout tab */}
                  {optionsTab === "layout" && (
                    <>
                      {layouts.length > 0 && (
                        <>
                          {layouts.map((layout) => (
                            <div key={layout.name} className="flex items-center justify-between px-2 py-1.5 text-sm rounded hover:bg-muted group">
                              <button type="button" className="flex-1 text-left cursor-pointer" onClick={() => handleLoadLayout(layout)}>
                                {layout.name}
                              </button>
                              <button
                                type="button"
                                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                                onClick={() => handleDeleteLayout(layout.name)}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          <div className="border-t my-1.5" />
                        </>
                      )}
                      {showSaveInput ? (
                        <div className="flex items-center gap-1 px-1">
                          <input
                            type="text"
                            value={layoutNameInput}
                            onChange={(e) => setLayoutNameInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSaveLayout()}
                            placeholder={t("common.layoutName")}
                            className="flex-1 px-2 py-1 text-sm rounded border bg-background"
                            autoFocus
                          />
                          <button type="button" className="p-1 text-primary hover:text-primary/80" onClick={handleSaveLayout}>
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted cursor-pointer w-full text-left"
                          onClick={() => setShowSaveInput(true)}
                        >
                          {t("common.saveLayout")}
                        </button>
                      )}
                      <div className="border-t my-1.5" />
                      <button
                        type="button"
                        className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted cursor-pointer w-full text-left"
                        onClick={handleResetLayout}
                      >
                        {t("common.resetLayout")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Export */}
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-1" />
          {t("common.exportExcel")}
        </Button>
      </div>

      {/* Grid */}
      <div style={containerStyle}>
        <AgGridReact<T>
          ref={gridRef}
          theme={gridTheme}
          rowData={groupedRowData}
          columnDefs={finalColumnDefs}
          isFullWidthRow={groupByColumn ? isFullWidthRow : undefined}
          fullWidthCellRenderer={groupByColumn ? fullWidthCellRenderer : undefined}
          defaultColDef={defaultColDef}
          autoSizeStrategy={autoSizeStrategy}
          domLayout={domLayout}
          localeText={agGridLocale}
          onGridReady={onGridReady}
          onSelectionChanged={onDelete ? onSelectionChanged : undefined}
          rowSelection={onDelete ? { mode: "multiRow" } : undefined}
          animateRows={true}
          pagination={effectivePagination}
          paginationPageSize={paginationPageSize}
          suppressCellFocus={true}
        />
      </div>
    </div>
  );
}
