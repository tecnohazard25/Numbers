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
  Upload,
  ArrowLeftRight,
  Inbox,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Star,
  Trash2,
  Group,
  X,
  Settings2,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import * as XLSX from "xlsx-js-style";
import { useTranslation } from "@/lib/i18n/context";
import { getAgGridLocale } from "@/lib/i18n/ag-grid";

ModuleRegistry.registerModules([AllCommunityModule]);

// --- Import/Export dropdown menu ---
function ImportExportMenu({
  onExport,
  importItems,
  disabled,
  t,
}: {
  onExport: () => void;
  importItems?: DataGridImportItem[];
  disabled: boolean;
  t: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="outline"
        size="sm"
        disabled={disabled && (!importItems || importItems.length === 0)}
        onClick={() => setOpen((v) => !v)}
      >
        <ArrowLeftRight className="h-4 w-4 mr-1" />
        {t("common.importExport")}
      </Button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 min-w-[200px] rounded-md border bg-popover shadow-md py-1">
          {/* Export section */}
          <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            {t("common.exports")}
          </div>
          <button
            type="button"
            className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors text-left disabled:opacity-50"
            disabled={disabled}
            onClick={() => { onExport(); setOpen(false); }}
          >
            <span className="flex items-center justify-center w-5 h-5 rounded bg-green-600 text-white">
              <Download className="h-3 w-3" />
            </span>
            Excel
          </button>
          {/* Import section */}
          {importItems && importItems.length > 0 && (
            <>
              <div className="border-t my-1" />
              <div className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                {t("common.imports")}
              </div>
              {importItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-muted transition-colors text-left"
                  onClick={() => { item.onClick(); setOpen(false); }}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

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
  oddRowBackgroundColor: "oklch(0.19 0.012 260)",
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
  oddRowBackgroundColor: "oklch(0.96 0.005 260)",
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
  isDefault?: boolean;
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
export interface DataGridImportItem {
  label: string;
  onClick: () => void;
}

export interface DataGridCustomAction<T> {
  label: string;
  icon?: ReactNode;
  variant?: "default" | "outline" | "ghost" | "destructive";
  onClick: (selectedRows: T[]) => void;
  requiresSelection?: boolean;
  disabled?: boolean;
}

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
  importItems?: DataGridImportItem[];
  customActions?: DataGridCustomAction<T>[];
}

export function DataGrid<T>({
  rowData,
  columnDefs,
  domLayout = "normal",
  height,
  gridId,
  pagination = true,
  paginationPageSize = 50,
  exportFileName = "export",
  renderMobileCard,
  onCreate,
  onEdit,
  onDelete,
  importItems,
  customActions,
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

  // Show native title tooltip only when cell text is actually truncated
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onCellMouseOver = useCallback((params: any) => {
    const evt = params.event as Event | null | undefined;
    if (!evt) return;
    const target = evt.target as HTMLElement | null;
    if (!target) return;
    // AG Grid renders cell text inside .ag-cell-value or the cell itself
    const el = target.closest<HTMLElement>(".ag-cell-value") ?? target.closest<HTMLElement>(".ag-cell");
    if (!el) return;
    if (el.scrollWidth > el.clientWidth) {
      el.title = el.textContent?.trim() ?? "";
    } else {
      el.removeAttribute("title");
    }
  }, []);

  // Names of columns that should stretch to fill remaining space
  const STRETCH_COLUMNS = useMemo(() => new Set([
    t("common.name"),
    t("common.description"),
    "Nome",
    "Descrizione",
    "Name",
    "Description",
  ]), [t]);

  // --- Column visibility ---
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const c of columnDefs) {
      if (c.hide && c.headerName) initial.add(c.headerName);
    }
    return initial;
  });

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

  // --- Row count (with filter awareness) ---
  const totalRows = rowData.length;
  const [filteredRowCount, setFilteredRowCount] = useState<number | null>(null);

  const onFilterChanged = useCallback(() => {
    if (!gridApiRef.current) return;
    let count = 0;
    gridApiRef.current.forEachNodeAfterFilter((node) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (node.data && !(node.data as any).__isGroupRow) count++;
    });
    setFilteredRowCount(count === totalRows ? null : count);
  }, [totalRows]);

  const displayedRowCount = filteredRowCount ?? totalRows;

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
  const defaultLayoutApplied = useRef(false);

  useEffect(() => {
    const loaded = loadLayouts(effectiveGridId);
    setLayouts(loaded);
    // Apply default layout on first load
    const defaultLayout = loaded.find((l) => l.isDefault);
    if (defaultLayout && !defaultLayoutApplied.current) {
      defaultLayoutApplied.current = true;
      setHiddenColumns(new Set(defaultLayout.hiddenColumns));
      setGroupByColumn(defaultLayout.groupByColumn);
    }
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

  const handleToggleDefault = useCallback((name: string) => {
    const updated = layouts.map((l) => ({
      ...l,
      isDefault: l.name === name ? !l.isDefault : false,
    }));
    setLayouts(updated);
    saveLayouts(effectiveGridId, updated);
  }, [layouts, effectiveGridId]);

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
    }
    setOptionsMenuOpen(false);
  }, []);

  // --- Visible columns ---
  const visibleColumnDefs = useMemo(() => {
    const hasStretch = columnDefs.some((c) => c.headerName && STRETCH_COLUMNS.has(c.headerName));
    return columnDefs.map((c) => ({
      ...c,
      hide: c.headerName ? hiddenColumns.has(c.headerName) : false,
      // If a stretch column exists, give it flex:1 to fill remaining space
      // If no stretch column exists, give all resizable columns flex:1
      ...(c.headerName && STRETCH_COLUMNS.has(c.headerName)
        ? { flex: 1 }
        : !hasStretch && c.resizable !== false && c.headerName
          ? { flex: 1 }
          : {}),
    }));
  }, [columnDefs, hiddenColumns, STRETCH_COLUMNS]);

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
                  className="p-1 rounded hover:bg-muted transition-colors cursor-pointer"
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

  // --- Pagination (needed before selection logic) ---
  const effectivePagination = pagination && !groupByColumn;

  // --- Selection for delete ---
  const [selectedRows, setSelectedRows] = useState<T[]>([]);
  const [wantAllPages, setWantAllPages] = useState(false);

  // All real data rows (excluding group headers)
  const allDataRows = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return rowData.filter((r) => !(r as any).__isGroupRow);
  }, [rowData]);

  // Reset selection when data changes (e.g. after delete)
  useEffect(() => {
    setSelectedRows([]);
    setWantAllPages(false);
    if (gridApiRef.current) {
      gridApiRef.current.deselectAll();
    }
  }, [rowData]);

  const onSelectionChanged = useCallback(() => {
    if (!gridApiRef.current || !onDelete) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const selected = gridApiRef.current.getSelectedRows().filter((r) => !(r as any).__isGroupRow);
    setSelectedRows(selected);
    // If user manually changes selection, exit "all pages" mode
    if (wantAllPages) setWantAllPages(false);
  }, [onDelete, wantAllPages]);

  // Show the "select all" banner when user selected all rows on the current page
  // but there are more rows on other pages
  const showSelectAllBanner = useMemo(() => {
    if (!onDelete || !effectivePagination || selectedRows.length === 0 || wantAllPages) return false;
    // Check if selected count >= page size AND total rows > selected
    const pageSize = paginationPageSize;
    return selectedRows.length >= pageSize && allDataRows.length > selectedRows.length;
  }, [onDelete, effectivePagination, selectedRows.length, paginationPageSize, allDataRows.length, wantAllPages]);

  const handleSelectAllPages = useCallback(() => {
    setWantAllPages(true);
  }, []);

  const handleClearSelection = useCallback(() => {
    setWantAllPages(false);
    setSelectedRows([]);
    if (gridApiRef.current) gridApiRef.current.deselectAll();
  }, []);

  // The rows that will actually be passed to onDelete
  const effectiveSelectedRows = wantAllPages ? allDataRows : selectedRows;

  // --- Double click to edit ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onRowDoubleClicked = useCallback((params: any) => {
    if (!onEdit || !params.data || params.data.__isGroupRow) return;
    onEdit(params.data as T);
  }, [onEdit]);

  // --- Keyboard delete ---
  useEffect(() => {
    if (!onDelete) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        // Don't trigger when typing in inputs/textareas
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const rows = wantAllPages ? allDataRows : selectedRows;
        if (rows.length > 0) {
          e.preventDefault();
          onDelete(rows);
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onDelete, selectedRows]);

  // --- Final column defs ---
  const finalColumnDefs = useMemo(() => {
    const cols = visibleColumnDefs;
    return editColDef ? [editColDef, ...cols] : cols;
  }, [editColDef, visibleColumnDefs]);

  const onGridReady = useCallback((params: GridReadyEvent<T>) => {
    gridApiRef.current = params.api;
  }, []);

  const onFirstDataRendered = useCallback(() => {
    // Apply default layout sort/widths after data is rendered
    const defaultLayout = layouts.find((l) => l.isDefault);
    if (defaultLayout && gridApiRef.current) {
      const colState = gridApiRef.current.getColumnState().map((cs) => {
        const sortEntry = defaultLayout.sortModel.find((s) => s.colId === cs.colId);
        return { ...cs, sort: sortEntry?.sort ?? null, sortIndex: sortEntry ? 0 : null };
      });
      gridApiRef.current.applyColumnState({ state: colState });
    }
  }, [layouts]);

  // --- Export helpers ---
  const DATE_RE = /^\d{1,4}[/\-.]\d{1,2}[/\-.]\d{1,4}$/;

  const getExportRaw = useCallback((item: T, col: ColDef<T>) => {
    const field = col.field as string | undefined;
    const vg = col.valueGetter;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let v: any;
    if (vg && typeof vg === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      v = vg({ data: item, colDef: col } as any);
    } else if (field) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      v = (item as any)[field];
    }
    return v;
  }, []);

  const getExportDisplay = useCallback((item: T, col: ColDef<T>) => {
    const raw = getExportRaw(item, col);
    const vf = col.valueFormatter;
    if (vf && typeof vf === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return vf({ value: raw, data: item, colDef: col } as any);
    }
    return raw;
  }, [getExportRaw]);

  // Fields that must always be exported as text (codes, identifiers)
  const FORCE_TEXT_FIELDS = new Set(["tax_code", "vat_number", "sdi_code", "iban", "zip_code"]);
  const FORCE_TEXT_HEADERS = new Set(["C.F. / P.IVA", "CF", "P.IVA", "SDI", "IBAN", "CAP"]);

  /** Convert a cell value to a properly typed XLSX cell */
  const toCellValue = useCallback((item: T, col: ColDef<T>) => {
    const raw = getExportRaw(item, col);
    const display = getExportDisplay(item, col);

    // Force text for code/identifier columns
    const field = col.field as string | undefined;
    if (
      (field && FORCE_TEXT_FIELDS.has(field)) ||
      (col.headerName && FORCE_TEXT_HEADERS.has(col.headerName))
    ) {
      return String(display ?? "");
    }

    if (typeof raw === "number") return raw;
    if (raw instanceof Date) return raw;
    // ISO date from raw
    if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}/.test(raw)) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d;
    }
    const s = String(display ?? "");
    if (!s) return "";
    // Formatted date dd/mm/yyyy or similar
    if (DATE_RE.test(s)) {
      const p = s.split(/[/\-.]/);
      if (p.length === 3) {
        const d = p[2].length === 4
          ? new Date(+p[2], +p[1] - 1, +p[0])
          : p[0].length === 4
            ? new Date(+p[0], +p[1] - 1, +p[2])
            : null;
        if (d && !isNaN(d.getTime())) return d;
      }
    }
    // Numeric string (but not zero-padded codes like "00123")
    const cleaned = s.replace(/\./g, "").replace(",", ".");
    const num = Number(cleaned);
    if (s.trim() && !isNaN(num) && isFinite(num) && !/^0\d/.test(s.trim())) return num;
    return s;
  }, [getExportRaw, getExportDisplay]);

  /** Header style constant */
  const HEADER_STYLE = {
    fill: { fgColor: { rgb: "4472C4" } },
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
    alignment: { horizontal: "center" as const, vertical: "center" as const },
    border: {
      bottom: { style: "thin" as const, color: { rgb: "2F5496" } },
    },
  };

  /** Build a styled worksheet from items */
  const buildSheet = useCallback((headers: string[], items: T[], cols: ColDef<T>[]): XLSX.WorkSheet => {
    const colWidths = headers.map((h) => h.length);
    const sheetRows: unknown[][] = [];
    for (const item of items) {
      const row = cols.map((col, ci) => {
        const val = toCellValue(item, col);
        const len = String(val ?? "").length;
        if (len > colWidths[ci]) colWidths[ci] = len;
        return val;
      });
      sheetRows.push(row);
    }
    const ws = XLSX.utils.aoa_to_sheet([headers, ...sheetRows]);
    // Style headers
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c: C });
      if (ws[addr]) ws[addr].s = HEADER_STYLE;
    }
    // Detect which columns are forced-text
    const forceTextCols = new Set<number>();
    cols.forEach((col, ci) => {
      const field = col.field as string | undefined;
      if (
        (field && FORCE_TEXT_FIELDS.has(field)) ||
        (col.headerName && FORCE_TEXT_HEADERS.has(col.headerName))
      ) {
        forceTextCols.add(ci);
      }
    });
    // Detect currency columns: columns where raw is number and display contains currency symbol
    // Check multiple rows because some columns (e.g. "In" amount) may be null on certain rows
    const currencyCols = new Set<number>();
    if (items.length > 0) {
      cols.forEach((col, ci) => {
        for (const item of items) {
          const raw = getExportRaw(item, col);
          const display = String(getExportDisplay(item, col) ?? "");
          if (typeof raw === "number" && /[€$£¥]/.test(display)) {
            currencyCols.add(ci);
            break;
          }
        }
      });
    }
    // Format date cells, currency cells, force text cells
    for (let R = 1; R <= range.e.r; R++) {
      for (let C = range.s.c; C <= range.e.c; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[addr];
        if (!cell) continue;
        if (cell.v instanceof Date) {
          cell.t = "d";
          cell.z = "DD/MM/YYYY";
        } else if (forceTextCols.has(C)) {
          cell.t = "s";
          cell.v = String(cell.v ?? "");
        } else if (currencyCols.has(C) && typeof cell.v === "number") {
          cell.t = "n";
          cell.z = '#,##0.00 "€"';
        }
      }
    }
    // Column widths (min 10, max 40)
    ws["!cols"] = colWidths.map((w) => ({ wch: Math.min(Math.max(w + 3, 10), 40) }));
    ws["!rows"] = [{ hpx: 26 }];
    return ws;
  }, [toCellValue]);

  // --- Export ---
  const handleExport = useCallback(() => {
    const cols = columnDefs.filter(
      (c) => c.headerName && c.headerName !== t("common.actions") && c.headerName !== t("common.active") && !hiddenColumns.has(c.headerName!)
    );
    const headers = cols.map((c) => c.headerName ?? "");

    // Collect filtered/sorted items
    const allItems: T[] = [];
    if (gridApiRef.current) {
      gridApiRef.current.forEachNodeAfterFilterAndSort((node) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (node.data && !(node.data as any).__isGroupRow) allItems.push(node.data);
      });
    } else {
      allItems.push(...rowData);
    }

    const wb = XLSX.utils.book_new();

    if (groupByColumn) {
      // One sheet per group
      const groupCol = columnDefs.find((c) => c.headerName === groupByColumn);
      if (groupCol) {
        const groups = new Map<string, T[]>();
        for (const item of allItems) {
          const key = getGroupValue(item, groupCol) || t("common.none");
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(item);
        }
        for (const [name, items] of groups) {
          const sheetName = name.replace(/[\\/*?:\[\]]/g, "_").substring(0, 31) || "Gruppo";
          XLSX.utils.book_append_sheet(wb, buildSheet(headers, items, cols), sheetName);
        }
      }
    }

    // Single sheet if not grouped (or fallback)
    if (wb.SheetNames.length === 0) {
      XLSX.utils.book_append_sheet(wb, buildSheet(headers, allItems, cols), "Dati");
    }

    XLSX.writeFile(wb, `${exportFileName}.xlsx`);
  }, [exportFileName, columnDefs, rowData, t, hiddenColumns, groupByColumn, getGroupValue, buildSheet]);

  const containerStyle = useMemo(
    () => ({
      width: "100%",
      ...(domLayout === "autoHeight"
        ? {}
        : height
          ? { height }
          : { flex: "1 1 0%", minHeight: 0 }),
    }),
    [domLayout, height]
  );

  // (effectivePagination defined earlier, before selection logic)

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
      <div className="flex flex-col flex-1 min-h-0 gap-3">
        <div className="flex items-center gap-2 shrink-0">
          {onCreate && (
            <Button size="sm" onClick={onCreate}>
              <Plus className="h-4 w-4 mr-1" />
              {t("common.new")}
            </Button>
          )}
          <div className="flex-1" />
        </div>
        {rowData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Inbox className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm">{t("common.noData")}</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto space-y-3">
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
              disabled={effectiveSelectedRows.length === 0}
              onClick={() => onDelete(effectiveSelectedRows)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {t("common.delete")} {effectiveSelectedRows.length > 0 && `(${effectiveSelectedRows.length})`}
            </Button>
          )}
          {customActions?.map((action, idx) => (
            <Button
              key={idx}
              variant={(action.variant as "default" | "outline" | "ghost" | "destructive") ?? "outline"}
              size="sm"
              disabled={action.disabled || (action.requiresSelection !== false && effectiveSelectedRows.length === 0)}
              onClick={() => action.onClick(effectiveSelectedRows)}
            >
              {action.icon}
              {action.label} {action.requiresSelection !== false && effectiveSelectedRows.length > 0 && `(${effectiveSelectedRows.length})`}
            </Button>
          ))}
          {/* Gmail-style "select all pages" inline */}
          {showSelectAllBanner && (
            <span className="text-xs text-muted-foreground">
              {t("common.selectedOnPage", { count: String(selectedRows.length) })}{" "}
              <button
                type="button"
                className="text-primary font-medium hover:underline cursor-pointer"
                onClick={handleSelectAllPages}
              >
                {t("common.selectAll", { count: String(allDataRows.length) })}
              </button>
            </span>
          )}
          {wantAllPages && (
            <span className="text-xs">
              <span className="text-primary font-medium">
                {t("common.allSelected", { count: String(allDataRows.length) })}
              </span>{" "}
              <button
                type="button"
                className="text-muted-foreground hover:underline cursor-pointer"
                onClick={handleClearSelection}
              >
                {t("common.clearSelection")}
              </button>
            </span>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Row count */}
        <span className="text-xs text-muted-foreground">
          {filteredRowCount !== null
            ? `${filteredRowCount} / ${totalRows} ${t("common.rows")}`
            : `${totalRows} ${t("common.rows")}`}
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
          <Button variant="outline" size="sm" disabled={rowData.length === 0} onClick={() => setOptionsMenuOpen((v) => !v)}>
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
                        <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
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
                            <div key={layout.name} className="flex items-center gap-1 px-2 py-1.5 text-sm rounded hover:bg-muted group">
                              <Tooltip>
                                <TooltipTrigger render={
                                  <button
                                    type="button"
                                    className="shrink-0 transition-colors"
                                    onClick={() => handleToggleDefault(layout.name)}
                                  >
                                    <Star className={`h-3.5 w-3.5 ${layout.isDefault ? "text-amber-500 fill-amber-500" : "text-muted-foreground/30 hover:text-amber-500"}`} />
                                  </button>
                                } />
                                <TooltipContent>{layout.isDefault ? t("common.removeDefault") : t("common.setAsDefault")}</TooltipContent>
                              </Tooltip>
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
                          <Save className="h-3.5 w-3.5 text-muted-foreground" />
                          {t("common.saveLayout")}
                        </button>
                      )}
                      <div className="border-t my-1.5" />
                      <button
                        type="button"
                        className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted cursor-pointer w-full text-left"
                        onClick={handleResetLayout}
                      >
                        <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                        {t("common.resetLayout")}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Import/Export dropdown */}
        <ImportExportMenu
          onExport={handleExport}
          importItems={importItems}
          disabled={rowData.length === 0}
          t={t}
        />
      </div>

      {rowData.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] gap-3">
          <Inbox className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">{t("common.noData")}</p>
        </div>
      ) : (
        <div style={containerStyle}>
          <AgGridReact<T>
            ref={gridRef}
            theme={gridTheme}
            rowData={groupedRowData}
            columnDefs={finalColumnDefs}
            isFullWidthRow={groupByColumn ? isFullWidthRow : undefined}
            fullWidthCellRenderer={groupByColumn ? fullWidthCellRenderer : undefined}
            defaultColDef={defaultColDef}
            domLayout={domLayout}
            localeText={agGridLocale}
            onGridReady={onGridReady}
            onFirstDataRendered={onFirstDataRendered}
            onFilterChanged={onFilterChanged}
            onRowDoubleClicked={onEdit ? onRowDoubleClicked : undefined}
            onSelectionChanged={onDelete ? onSelectionChanged : undefined}
            rowSelection={onDelete ? { mode: "multiRow", selectAll: "currentPage" } : undefined}
            animateRows={true}
            pagination={effectivePagination}
            paginationPageSize={paginationPageSize}
            suppressCellFocus={true}
            onCellMouseOver={onCellMouseOver}
          />
        </div>
      )}
    </div>
  );
}
