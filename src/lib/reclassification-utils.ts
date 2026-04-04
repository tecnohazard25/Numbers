import type { ReclassificationNode, ReclassificationNodeWithChildren } from "@/types/supabase";

export function buildTree(nodes: ReclassificationNode[]): ReclassificationNodeWithChildren[] {
  const map = new Map<string, ReclassificationNodeWithChildren>();
  const roots: ReclassificationNodeWithChildren[] = [];

  for (const node of nodes) {
    map.set(node.id, { ...node, children: [] });
  }

  for (const node of nodes) {
    const current = map.get(node.id)!;
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(current);
    } else {
      roots.push(current);
    }
  }

  const sortChildren = (items: ReclassificationNodeWithChildren[]) => {
    items.sort((a, b) => a.order_index - b.order_index);
    for (const item of items) {
      sortChildren(item.children);
    }
  };
  sortChildren(roots);

  return roots;
}

/** Flatten tree into display-order list with depth info */
export type FlatNode = ReclassificationNode & { depth: number };

export function flattenTreeWithDepth(
  roots: ReclassificationNodeWithChildren[],
  expandedIds: Set<string>
): FlatNode[] {
  const result: FlatNode[] = [];

  function walk(nodes: ReclassificationNodeWithChildren[], depth: number) {
    for (const node of nodes) {
      const { children, ...rest } = node;
      result.push({ ...rest, depth });
      if (expandedIds.has(node.id) && children.length > 0) {
        walk(children, depth + 1);
      }
    }
  }

  walk(roots, 0);
  return result;
}

/**
 * Project where a dragged node would land based on:
 * - overIndex: index of the item being hovered over
 * - deltaX: horizontal mouse movement (positive = indent deeper)
 * - flatNodes: the current visible flat list
 * - dragId: the id of the dragged node
 *
 * Returns { parentId, index } for the projected position.
 */
export function projectDrop(
  flatNodes: FlatNode[],
  activeId: string,
  overId: string,
  deltaX: number
): { parentId: string | null; insertIndex: number } | null {
  const INDENT_PX = 20;
  const overIndex = flatNodes.findIndex((n) => n.id === overId);
  const activeIndex = flatNodes.findIndex((n) => n.id === activeId);

  if (overIndex === -1 || activeIndex === -1) return null;

  const overNode = flatNodes[overIndex];
  const depthChange = Math.round(deltaX / INDENT_PX);
  const baseDepth = overNode.depth;

  // The max depth we can go is overNode.depth + 1 (make child of over)
  // The min depth is 0 (root level)
  // Look at the next visible node to constrain
  const nextNode = flatNodes[overIndex + 1];
  const maxDepth = overNode.depth + 1;
  const minDepth = nextNode ? Math.min(nextNode.depth, 0) : 0;

  let projectedDepth = baseDepth + depthChange;
  projectedDepth = Math.max(0, Math.min(maxDepth, projectedDepth));

  // Now determine parent based on projected depth:
  // Walk backwards from overIndex to find the node at projectedDepth - 1
  if (projectedDepth === 0) {
    // Root level — find position among roots
    // Count how many root nodes are before overIndex
    let rootIndex = 0;
    for (let i = 0; i <= overIndex; i++) {
      if (flatNodes[i].depth === 0 && flatNodes[i].id !== activeId) rootIndex++;
    }
    return { parentId: null, insertIndex: rootIndex };
  }

  // Find parent: walk back from overIndex to find a node at depth === projectedDepth - 1
  for (let i = overIndex; i >= 0; i--) {
    if (flatNodes[i].depth === projectedDepth - 1 && flatNodes[i].id !== activeId) {
      const parentId = flatNodes[i].id;
      // Count siblings already under this parent that appear before the drop point
      let siblingIndex = 0;
      for (let j = i + 1; j <= overIndex; j++) {
        if (flatNodes[j].depth === projectedDepth && flatNodes[j].parent_id === parentId && flatNodes[j].id !== activeId) {
          siblingIndex++;
        }
      }
      return { parentId, insertIndex: siblingIndex };
    }
  }

  return { parentId: null, insertIndex: 0 };
}
