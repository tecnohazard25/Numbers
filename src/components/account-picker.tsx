"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronRight, Search, X } from "lucide-react";
import { useTranslation } from "@/lib/i18n/context";
import { useIsMobile } from "@/hooks/use-mobile";

export interface AccountNode {
  id: string;
  full_code: string;
  name: string;
  parent_id: string | null;
  sign?: "positive" | "negative";
  is_total?: boolean;
}

interface AccountPickerProps {
  nodes: AccountNode[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

interface TreeNode extends AccountNode {
  children: TreeNode[];
  isLeaf: boolean;
}

function buildTree(nodes: AccountNode[]): TreeNode[] {
  const filtered = nodes.filter((n) => !n.is_total);
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const n of filtered) {
    map.set(n.id, { ...n, children: [], isLeaf: true });
  }
  for (const n of filtered) {
    const treeNode = map.get(n.id)!;
    if (n.parent_id && map.has(n.parent_id)) {
      const parent = map.get(n.parent_id)!;
      parent.children.push(treeNode);
      parent.isLeaf = false;
    } else {
      roots.push(treeNode);
    }
  }
  return roots;
}

interface FlatItem {
  node: TreeNode;
  depth: number;
  isLeaf: boolean;
}

function flattenTree(roots: TreeNode[], depth = 0): FlatItem[] {
  const result: FlatItem[] = [];
  for (const node of roots) {
    result.push({ node, depth, isLeaf: node.isLeaf });
    if (node.children.length > 0) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

function matchesSearch(item: FlatItem, q: string): boolean {
  const lower = q.toLowerCase();
  return item.node.name.toLowerCase().includes(lower) || item.node.full_code.toLowerCase().includes(lower);
}

function AccountList({
  items,
  value,
  search,
  t,
  onSelect,
}: {
  items: FlatItem[];
  value: string;
  search: string;
  t: (key: string) => string;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <button
        type="button"
        className={`w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors ${!value ? "text-primary font-medium" : ""}`}
        onClick={() => onSelect("")}
      >
        {t("transactions.noAccount")}
      </button>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">{t("common.noData")}</p>
      ) : (
        items.map((item) => {
          const isSelected = item.node.id === value;
          const signColor = item.node.sign === "positive"
            ? "text-green-700 dark:text-green-400"
            : item.node.sign === "negative"
              ? "text-red-700 dark:text-red-400"
              : "text-muted-foreground";

          if (!search && !item.isLeaf) {
            return (
              <div
                key={item.node.id}
                className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider ${signColor}`}
                style={{ paddingLeft: `${item.depth * 12 + 12}px` }}
              >
                <span className="flex items-center gap-1">
                  <ChevronRight className="h-3 w-3" />
                  <span className="font-mono">{item.node.full_code}</span>
                  {item.node.name}
                </span>
              </div>
            );
          }
          return (
            <button
              key={item.node.id}
              type="button"
              className={`w-full text-left px-3 py-2.5 hover:bg-muted transition-colors ${isSelected ? "bg-primary/5" : ""}`}
              style={!search ? { paddingLeft: `${item.depth * 12 + 12}px` } : undefined}
              onClick={() => onSelect(item.node.id)}
            >
              <div className="flex items-center gap-2 text-sm">
                {item.node.sign && (
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    item.node.sign === "positive" ? "bg-green-500" : "bg-red-500"
                  }`} />
                )}
                <span className="text-xs text-muted-foreground font-mono shrink-0">
                  {item.node.full_code}
                </span>
                <span className="truncate">{item.node.name}</span>
              </div>
            </button>
          );
        })
      )}
    </>
  );
}

export function AccountPicker({ nodes, value, onChange, placeholder }: AccountPickerProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [maxListHeight, setMaxListHeight] = useState(300);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const flatItems = useMemo(() => flattenTree(tree), [tree]);

  const filtered = useMemo(() => {
    if (!search) return flatItems;
    return flatItems.filter((item) => item.isLeaf && matchesSearch(item, search));
  }, [flatItems, search]);

  const selectedNode = nodes.find((n) => n.id === value);

  const handleOpen = () => {
    if (!isMobile && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const dropUp = spaceBelow < 200 && spaceAbove > spaceBelow;
      const availableSpace = dropUp ? spaceAbove : spaceBelow;
      setMaxListHeight(Math.max(availableSpace - 56, 120));
      setDropdownStyle({
        position: "fixed",
        left: rect.left,
        width: rect.width,
        ...(dropUp
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
      });
    }
    setOpen(true);
  };

  const handleClose = () => { setOpen(false); setSearch(""); };
  const handleSelect = (id: string) => { onChange(id); handleClose(); };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="flex items-center w-full h-8 px-3 rounded-md border bg-background text-sm text-left hover:bg-muted/50 transition-colors cursor-pointer"
        onClick={handleOpen}
      >
        <span className="flex-1 truncate">
          {value && selectedNode ? (
            <span className="flex items-center gap-1.5">
              {selectedNode.sign && (
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  selectedNode.sign === "positive" ? "bg-green-500" : "bg-red-500"
                }`} />
              )}
              <span className="text-xs text-muted-foreground font-mono">{selectedNode.full_code}</span>
              <span>{selectedNode.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder ?? t("transactions.selectAccount")}</span>
          )}
        </span>
        {value ? (
          <X
            className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-2 hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
          />
        ) : (
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-2" />
        )}
      </button>

      {open && createPortal(
        isMobile ? (
          /* Mobile: full-screen panel */
          <div className="fixed inset-0 z-[100] bg-background flex flex-col">
            <div className="flex items-center gap-2 p-3 border-b">
              <Button variant="ghost" size="icon-sm" onClick={handleClose}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("common.search")}
                  className="pl-7 h-9 text-sm"
                  autoFocus
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AccountList items={filtered} value={value} search={search} t={t} onSelect={handleSelect} />
            </div>
          </div>
        ) : (
          /* Desktop: positioned dropdown */
          <>
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
            <div className="fixed inset-0 z-[100]" onClick={handleClose} />
            <div className="z-[101] rounded-md border bg-popover shadow-md" style={dropdownStyle}>
              <div className="p-2">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("common.search")}
                    className="pl-7 h-8 text-sm"
                    autoFocus
                  />
                </div>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: `${maxListHeight}px` }}>
                <AccountList items={filtered} value={value} search={search} t={t} onSelect={handleSelect} />
              </div>
            </div>
          </>
        ),
        document.body
      )}
    </div>
  );
}
