"use client";

import { useCallback, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/context";
import { NodeTreeItem } from "./node-tree-item";
import type { ReclassificationNodeWithChildren, ReclassificationNode, ReclassificationNodeRef } from "@/types/supabase";
import { flattenTreeWithDepth } from "@/lib/reclassification-utils";

interface NodeTreeProps {
  tree: ReclassificationNodeWithChildren[];
  allNodes: ReclassificationNode[];
  baseNodes?: ReclassificationNode[];
  nodeRefs: ReclassificationNodeRef[];
  selectedNodeId: string | null;
  expandedIds: Set<string>;
  onSelectNode: (nodeId: string) => void;
  onToggleExpand: (nodeId: string) => void;
  onMoveNode: (nodeId: string, newParentId: string | null) => Promise<void>;
  onReorderSiblings: (parentId: string | null, orderedIds: string[]) => Promise<void>;
  onAddChild: (parentId: string | null) => void;
  isAccountant: boolean;
  isNonBaseSchema?: boolean;
  searchQuery?: string;
}

function parseDropId(id: string): { zone: "before" | "inside"; nodeId: string } | null {
  if (id.startsWith("before:")) return { zone: "before", nodeId: id.slice(7) };
  if (id.startsWith("inside:")) return { zone: "inside", nodeId: id.slice(7) };
  return null;
}

export function NodeTree({
  tree,
  allNodes,
  baseNodes = [],
  nodeRefs,
  selectedNodeId,
  expandedIds,
  onSelectNode,
  onToggleExpand,
  onMoveNode,
  onReorderSiblings,
  onAddChild,
  isAccountant,
  isNonBaseSchema = false,
  searchQuery = "",
}: NodeTreeProps) {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overDropId, setOverDropId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const flatNodes = flattenTreeWithDepth(tree, expandedIds);

  // Search filtering: show matching nodes + their ancestors
  const q = searchQuery.trim().toLowerCase();
  const matchingIds = q
    ? new Set(
        allNodes
          .filter((n) => n.name.toLowerCase().includes(q) || n.full_code.toLowerCase().includes(q) || n.code.toLowerCase().includes(q))
          .map((n) => n.id)
      )
    : null;

  // Collect ancestor ids for matching nodes so they stay visible
  const visibleIds = matchingIds
    ? (() => {
        const ids = new Set(matchingIds);
        const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
        for (const id of matchingIds) {
          let current = nodeMap.get(id);
          while (current?.parent_id) {
            ids.add(current.parent_id);
            current = nodeMap.get(current.parent_id);
          }
        }
        return ids;
      })()
    : null;

  const filteredFlatNodes = visibleIds
    ? flatNodes.filter((n) => visibleIds.has(n.id))
    : flatNodes;

  const childrenMap = new Map<string, boolean>();
  for (const node of allNodes) {
    if (node.parent_id) childrenMap.set(node.parent_id, true);
  }

  // Build refs map: totalNodeId → refNodeIds[]
  const refsMap = new Map<string, string[]>();
  for (const ref of nodeRefs) {
    const existing = refsMap.get(ref.total_node_id) ?? [];
    existing.push(ref.ref_node_id);
    refsMap.set(ref.total_node_id, existing);
  }

  // Build nodeId → node map for formula display (includes base nodes for cross-template refs)
  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));
  for (const n of baseNodes) {
    if (!nodeMap.has(n.id)) nodeMap.set(n.id, n);
  }

  // Compute formula display string for total nodes
  function getFormulaDisplay(node: ReclassificationNode): string | null {
    if (!node.is_total) return null;
    if (node.formula) return node.formula;

    const refs = refsMap.get(node.id);
    if (!refs || refs.length === 0) return null;

    const parts = refs.map((refId) => {
      const refNode = nodeMap.get(refId);
      if (!refNode) return "?";
      const prefix = refNode.sign === "negative" ? "\u2212 " : "+ ";
      return prefix + refNode.code;
    });

    // First positive element doesn't need a "+"
    if (parts.length > 0 && parts[0].startsWith("+ ")) {
      parts[0] = parts[0].slice(2);
    }

    return "= " + parts.join(" ");
  }

  function isDescendantOf(nodeId: string, ancestorId: string): boolean {
    let current = nodeMap.get(nodeId);
    while (current?.parent_id) {
      if (current.parent_id === ancestorId) return true;
      current = nodeMap.get(current.parent_id);
    }
    return false;
  }

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    setOverDropId(event.over ? (event.over.id as string) : null);
  }, []);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const draggedId = activeId;
      const dropId = event.over?.id as string | undefined;
      setActiveId(null);
      setOverDropId(null);

      if (!draggedId || !dropId) return;
      const drop = parseDropId(dropId);
      if (!drop) return;

      const { zone, nodeId: targetNodeId } = drop;
      if (draggedId === targetNodeId) return;

      const activeNode = allNodes.find((n) => n.id === draggedId);
      const overNode = allNodes.find((n) => n.id === targetNodeId);
      if (!activeNode || !overNode) return;
      if (isDescendantOf(targetNodeId, draggedId)) return;

      if (zone === "before") {
        const targetParentId = overNode.parent_id ?? null;
        const currentParentId = activeNode.parent_id ?? null;

        if (currentParentId === targetParentId) {
          const siblings = allNodes
            .filter((n) => (n.parent_id ?? null) === targetParentId)
            .sort((a, b) => a.order_index - b.order_index);
          const oldIndex = siblings.findIndex((n) => n.id === draggedId);
          const newIndex = siblings.findIndex((n) => n.id === targetNodeId);
          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
          const reordered = [...siblings];
          const [moved] = reordered.splice(oldIndex, 1);
          const insertAt = reordered.findIndex((n) => n.id === targetNodeId);
          reordered.splice(insertAt, 0, moved);
          await onReorderSiblings(targetParentId, reordered.map((n) => n.id));
        } else {
          await onMoveNode(draggedId, targetParentId);
        }
      } else {
        await onMoveNode(draggedId, targetNodeId);
      }
    },
    [activeId, allNodes, onMoveNode, onReorderSiblings]
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
    setOverDropId(null);
  }, []);

  const dropInfo = overDropId && activeId ? parseDropId(overDropId) : null;
  const isValidDrop =
    dropInfo && activeId !== dropInfo.nodeId && !isDescendantOf(dropInfo.nodeId, activeId!);

  const activeNode = activeId ? flatNodes.find((n) => n.id === activeId) : null;

  return (
    <div className="flex flex-col">
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {filteredFlatNodes.map((node) => (
          <NodeTreeItem
            key={node.id}
            node={node}
            hasChildren={childrenMap.has(node.id)}
            isExpanded={expandedIds.has(node.id)}
            isSelected={selectedNodeId === node.id}
            isSearchMatch={matchingIds !== null && matchingIds.has(node.id)}
            isAccountant={isAccountant}
            showDropBefore={!!isValidDrop && dropInfo!.zone === "before" && dropInfo!.nodeId === node.id}
            showDropInside={!!isValidDrop && dropInfo!.zone === "inside" && dropInfo!.nodeId === node.id}
            formulaDisplay={getFormulaDisplay(node)}
            onToggleExpand={onToggleExpand}
            onSelectNode={onSelectNode}
            onAddChild={isAccountant ? onAddChild : undefined}
          />
        ))}

        <DragOverlay dropAnimation={null}>
          {activeNode && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-background shadow-lg ring-1 ring-primary/30 text-sm">
              <span className="font-mono text-xs text-muted-foreground">{activeNode.full_code}</span>
              <span>{activeNode.name}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {isAccountant && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-start text-muted-foreground"
          onClick={() => onAddChild(null)}
        >
          <Plus className="h-4 w-4 mr-2" />
          {isNonBaseSchema
            ? t("reclassification.addTotalNode")
            : t("reclassification.addRootNode")}
        </Button>
      )}
    </div>
  );
}
