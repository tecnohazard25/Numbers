"use client";

import { useDraggable, useDroppable } from "@dnd-kit/core";
import { ChevronRight, ChevronDown, GripVertical, Plus, Equal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NodeSignIndicator } from "./node-type-badge";
import type { FlatNode } from "@/lib/reclassification-utils";

interface NodeTreeItemProps {
  node: FlatNode & { is_total: boolean; formula: string | null };
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  isSearchMatch?: boolean;
  isAccountant: boolean;
  showDropBefore: boolean;
  showDropInside: boolean;
  formulaDisplay: string | null;
  onToggleExpand: (nodeId: string) => void;
  onSelectNode: (nodeId: string) => void;
  onAddChild?: (parentId: string) => void;
}

export function NodeTreeItem({
  node,
  hasChildren,
  isExpanded,
  isSelected,
  isSearchMatch = false,
  isAccountant,
  showDropBefore,
  showDropInside,
  formulaDisplay,
  onToggleExpand,
  onSelectNode,
  onAddChild,
}: NodeTreeItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: node.id });

  const { setNodeRef: setDropBeforeRef } = useDroppable({ id: `before:${node.id}` });
  const { setNodeRef: setDropInsideRef } = useDroppable({ id: `inside:${node.id}` });

  return (
    <div className="relative">
      {/* Drop indicator — BEFORE (sibling) */}
      {showDropBefore && (
        <div
          className="absolute top-0 left-0 right-0 h-0.5 bg-primary z-10 rounded-full"
          style={{ marginLeft: node.depth * 20 + 28 }}
        />
      )}

      {/* Drop indicator — INSIDE (child) */}
      {showDropInside && (
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary z-10 rounded-full"
          style={{ marginLeft: (node.depth + 1) * 20 + 28 }}
        />
      )}

      {/* Drop zones */}
      <div ref={setDropBeforeRef} className="absolute top-0 left-0 right-0 h-1/2 z-[1]" />
      <div ref={setDropInsideRef} className="absolute bottom-0 left-0 right-0 h-1/2 z-[1]" />

      <div
        className={`relative z-[2] flex items-center gap-1 px-2 rounded-md cursor-pointer group transition-colors ${
          node.is_total ? "border-t border-border mt-1.5 pt-1.5 py-1.5" : "py-1.5"
        } ${
          isSelected
            ? "bg-accent text-accent-foreground"
            : isSearchMatch
              ? "bg-yellow-100/60 dark:bg-yellow-900/20"
              : "hover:bg-muted/50"
        } ${isDragging ? "opacity-30" : ""}`}
        onClick={() => onSelectNode(node.id)}
      >
        {/* Drag handle */}
        {isAccountant && (
          <button
            ref={setDragRef}
            type="button"
            className="cursor-grab opacity-0 group-hover:opacity-50 hover:!opacity-100 shrink-0 touch-none"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}

        {/* Indentation */}
        <div style={{ width: node.depth * 20 }} className="shrink-0" />

        {/* Expand/collapse toggle */}
        <button
          type="button"
          className="shrink-0 w-5 h-5 flex items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleExpand(node.id);
          }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )
          ) : (
            <span className="w-3.5" />
          )}
        </button>

        {/* Node info */}
        <span className="font-mono text-xs text-muted-foreground shrink-0 min-w-[40px]">
          {node.full_code}
        </span>

        {/* Name + formula (stacked for totals) */}
        <div className="flex flex-col flex-1 min-w-0">
          <span className={`text-sm truncate ${node.is_total ? "font-semibold" : ""}`}>
            {node.name}
          </span>
          {node.is_total && formulaDisplay && (
            <span className="text-xs text-muted-foreground truncate">
              {formulaDisplay}
            </span>
          )}
        </div>

        {/* Badge: sign for regular nodes, = icon for totals */}
        <div className="flex items-center gap-1 shrink-0">
          {node.is_total ? (
            <Equal className="h-4.5 w-4.5 text-amber-500 dark:text-amber-400" />
          ) : (
            <NodeSignIndicator sign={node.sign} />
          )}
        </div>

        {/* Add child button */}
        {isAccountant && onAddChild && !node.is_total && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onAddChild(node.id);
            }}
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}
